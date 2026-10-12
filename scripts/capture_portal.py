"""Real session-authenticated UI regression. Groq is deliberately unconfigured.

Runs against a dedicated disposable PostgreSQL database. Media shows real human
handling and reviewed knowledge publication, without fabricating AI responses.
"""
import argparse
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
from urllib.parse import urlsplit, urlunsplit
import urllib.request
from PIL import Image
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / 'docs' / 'media'
LOGS = ROOT / '.superpowers' / 'portal-check'
BACKEND = int(os.getenv('PORTAL_BACKEND_PORT', '3102'))
FRONTEND = int(os.getenv('PORTAL_FRONTEND_PORT', '5181'))
BASE = f'http://127.0.0.1:{FRONTEND}'
PASSWORD = 'Browser-fixture-password-2026'
NODE = shutil.which('node')
FLAGS = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0

def fixture(action, env):
    subprocess.run([NODE, 'scripts/portalFixture.js', action], cwd=ROOT, env=env,
                   check=True, creationflags=FLAGS, capture_output=True)

def wait_ready(url, processes):
    deadline = time.monotonic() + 50
    while time.monotonic() < deadline:
        if any(p.poll() is not None for p in processes):
            raise RuntimeError('Portal process exited. See .superpowers/portal-check logs.')
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except (OSError, TimeoutError):
            time.sleep(.2)
    raise RuntimeError(f'Portal did not start: {url}')

def overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), f'Horizontal overflow on {page.url}'

def run(media):
    if not os.getenv('TEST_DATABASE_URL'):
        raise RuntimeError('Set TEST_DATABASE_URL to a dedicated test PostgreSQL connection.')
    parts = urlsplit(os.environ['TEST_DATABASE_URL'])
    database = urlunsplit((parts.scheme, parts.netloc, '/' + os.environ.get('PORTAL_TEST_DATABASE_NAME', 'supportloop_portal_test'), '', ''))
    env = {**os.environ, 'DATABASE_URL': database, 'AGENT_MODE': 'groq', 'STORAGE_MODE': 'postgres',
           'AUTH_MODE': 'session', 'DEMO_MODE': 'false', 'GROQ_API_KEY': '', 'OPENAI_API_KEY': '',
           'GROQ_MODEL': 'openai/gpt-oss-20b', 'ADMIN_EMAIL': 'portal-team@example.test',
           'ADMIN_PASSWORD': PASSWORD, 'ADMIN_NAME': "SupportLoop team", 'COOKIE_SECURE': 'false',
           'HOST': '127.0.0.1', 'PORT': str(BACKEND), 'VITE_API_BASE_URL': '', 'VITE_PROXY_TARGET': f'http://127.0.0.1:{BACKEND}',
           'BRAND_NAME': 'SupportLoop', 'CUSTOMER_API_KEY': '', 'SUPPORT_ADMIN_KEY': ''}
    MEDIA.mkdir(parents=True, exist_ok=True)
    LOGS.mkdir(parents=True, exist_ok=True)
    fixture('prepare', env)
    frames, tour, errors = [], [], []
    accessibility = []
    def shot(page, name):
        overflow(page)
        if os.getenv('AXE_CORE_PATH'):
            skip = page.get_by_role('link', name='Skip to content', exact=True)
            if skip.count():
                current_url = page.url
                page.keyboard.press('Tab')
                skip.focus()
                page.keyboard.press('Enter')
                assert page.url == current_url, 'Skipping content must not change the hash-based route'
                assert page.evaluate('document.activeElement.tagName') == 'MAIN'
                page.evaluate('window.scrollTo(0, 0)')
            for history in page.get_by_role('log', name='Message history').all():
                if history.is_visible():
                    page.keyboard.press('Tab')
                    history.focus()
                    assert history.evaluate('(node) => document.activeElement === node')
                    assert history.evaluate('(node) => parseFloat(getComputedStyle(node).outlineWidth) >= 2')
            page.add_script_tag(path=os.environ['AXE_CORE_PATH'])
            report = page.evaluate("""async () => {
                const r = await axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});
                return {url: location.pathname, violations: r.violations.map(v => ({id:v.id, impact:v.impact, description:v.description, nodes:v.nodes.map(n => ({target:n.target, html:n.html, summary:n.failureSummary}))}))};
            }""")
            accessibility.append({'screen': name, **report})
            (LOGS / 'accessibility.json').write_text(json.dumps(accessibility, indent=2), encoding='utf-8')
        if media:
            page.screenshot(path=str(MEDIA / name), full_page=True, animations='disabled')
            if name in ['portal-home.png','portal-help.png','portal-catalog.png','portal-admin-conversations.png','portal-admin-knowledge.png','portal-admin-dashboard.png']:
                tour.append(Image.open(io.BytesIO(page.screenshot(animations='disabled'))).convert('RGB').resize((1080,768)))
    def frame(page):
        if media:
            frames.append(Image.open(io.BytesIO(page.screenshot(animations='disabled'))).convert('RGB').resize((1080, 768)))
    with (LOGS / 'backend.log').open('w', encoding='utf-8') as blog, (LOGS / 'frontend.log').open('w', encoding='utf-8') as flog:
        processes = [subprocess.Popen([NODE, 'src/server.js'], cwd=ROOT/'backend', env=env, stdout=blog, stderr=blog, creationflags=FLAGS),
                     subprocess.Popen([NODE, 'node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', str(FRONTEND), '--strictPort'], cwd=ROOT/'frontend', env=env, stdout=flog, stderr=flog, creationflags=FLAGS)]
        try:
            wait_ready(f'http://127.0.0.1:{BACKEND}/api/health', processes)
            wait_ready(BASE, processes)
            with sync_playwright() as p:
                browser = p.chromium.launch()
                client_context = browser.new_context(viewport={'width':1440,'height':1024}, reduced_motion='reduce')
                team_context = browser.new_context(viewport={'width':1440,'height':1024}, reduced_motion='reduce')
                client, team = client_context.new_page(), team_context.new_page()
                for page in [client,team]:
                    page.set_default_timeout(10000)
                for page in [client,team]:
                    page.on('pageerror', lambda error: errors.append(str(error)))
                client.goto(BASE)
                expect(client.get_by_role('heading', name="Clear answers. Support that stays with you.")).to_be_visible()
                shot(client,'portal-home.png')
                frame(client)
                client.get_by_role('button',name="My account",exact=True).click()
                client.get_by_role('button',name="Create an account",exact=True).click()
                client.get_by_label("Your name",exact=True).fill('Amélie Laurent')
                client.get_by_label("Email address",exact=True).fill('portal-client@example.test')
                client.get_by_label("Password",exact=True).fill(PASSWORD)
                client.get_by_role('button',name="Create my account",exact=True).click()
                expect(client.get_by_role('button',name='Amélie',exact=True)).to_be_visible()
                client.reload()
                expect(client.get_by_role('button',name='Amélie',exact=True)).to_be_visible()
                client.goto(BASE+'/admin')
                expect(client.get_by_text("This account does not have administrator access.")).to_be_visible()
                client.goto(BASE+'/#home')
                team.goto(BASE+'/admin')
                team.get_by_label("Email address",exact=True).fill('portal-team@example.test')
                team.get_by_label("Password",exact=True).fill(PASSWORD)
                team.get_by_role('button',name="Sign in",exact=True).click()
                expect(team.get_by_role('heading',name="Overview",exact=True)).to_be_visible()
                print('Accounts, persistence and administrator role checked.',flush=True)
                # Publishing, editing and retracting public help articles.
                team.get_by_role('button',name="Help centre",exact=True).click()
                team.get_by_label("Title",exact=True).fill('Comment contacter notre équipe ?')
                team.get_by_label("Content",exact=True).fill('Créez une demande depuis votre espace. Retrouvez les réponses dans votre historique, même après la résolution.')
                team.get_by_role('button',name="Publish",exact=True).click()
                expect(team.get_by_text("Article published in the help centre.",exact=True)).to_be_visible()
                document=team.locator('.admin-document').first
                document.locator('summary').click()
                document.get_by_role('button',name='Edit',exact=True).click()
                team.get_by_label("Content",exact=True).fill('Créez une demande depuis votre espace personnel. Votre historique et chaque réponse restent disponibles après la résolution.')
                team.get_by_role('button',name="Save",exact=True).click()
                expect(team.get_by_text("Article updated.",exact=True)).to_be_visible()
                client.goto(BASE+'/#help')
                expect(client.get_by_text('Comment contacter notre équipe ?',exact=True)).to_be_visible()
                client.locator('.help-article summary').first.click()
                expect(client.get_by_text('Créez une demande depuis votre espace personnel.',exact=False)).to_be_visible()
                shot(client,'portal-help.png')
                print('Help article publication and updates checked.',flush=True)
                # Catalog records support arbitrary activities and identifiers.
                team.get_by_role('button',name="Catalogue",exact=True).click()
                team.get_by_role('button',name="Add a product",exact=True).click()
                team.get_by_label("Reference",exact=True).fill('SERVICE-ACCOMPAGNEMENT')
                team.get_by_label("Name",exact=True).fill('Accompagnement personnalisé')
                team.get_by_label("Description",exact=True).fill('Un rendez-vous pour faire le point sur votre situation et préparer la prochaine étape.')
                team.get_by_label("Price (€)",exact=True).fill('45')
                team.get_by_label("Stock",exact=True).fill('8')
                team.get_by_role('button',name="Save",exact=True).click()
                expect(team.get_by_text("Product saved.",exact=True)).to_be_visible()
                client.goto(BASE+'/#catalog')
                expect(client.get_by_role('heading',name='Accompagnement personnalisé',exact=True)).to_be_visible()
                shot(client,'portal-catalog.png')
                print('Catalog publication checked.',flush=True)
                fixture('order',env)
                client.get_by_role('button',name='Amélie',exact=True).click()
                expect(client.get_by_text('ORD-PORTAL-001',exact=True)).to_be_visible()
                # Missing Groq key yields a genuine human handoff.
                client.goto(BASE+'/#support')
                client.get_by_label("Customer message",exact=True).fill('Comment fonctionne le suivi personnalisé ?')
                client.get_by_role('button',name="Send",exact=True).click()
                expect(client.locator('.chat-header .badge')).to_have_text("Waiting")
                frame(client)
                shot(client,'portal-chat.png')
                team.get_by_role('button',name="Conversations",exact=True).click()
                row=team.locator('.queue-row').filter(has_text='Comment fonctionne le suivi personnalisé').first
                expect(row).to_be_visible()
                row.click()
                team.get_by_role('button',name="Take over",exact=True).click()
                team.get_by_label("Advisor reply",exact=True).fill('Le suivi personnalisé comprend trois rendez-vous. Chaque rendez-vous est préparé avec votre conseiller.')
                team.get_by_role('button',name="Send",exact=True).click()
                expect(client.locator('.message.human').last).to_contain_text('trois rendez-vous')
                frame(team)
                shot(team,'portal-admin-conversations.png')
                team.get_by_role('button',name="Resolve",exact=True).click()
                expect(team.locator('.case-header .badge')).to_have_text("Resolved")
                team.get_by_role('button',name="Knowledge",exact=True).click()
                team.locator('.queue-row').filter(has_text='suivi personnalisé').first.click()
                team.get_by_role('button',name="Review",exact=True).click()
                team.get_by_role('button',name="Edit",exact=True).click()
                team.get_by_label("Topic",exact=True).fill('suivi_personnalise')
                team.get_by_label("When this rule applies",exact=True).fill('Lorsqu’un client demande le contenu du suivi personnalisé.')
                team.get_by_label("General answer",exact=True).fill('Le suivi personnalisé comprend trois rendez-vous, préparés avec un conseiller.')
                team.get_by_role('button',name="Save",exact=True).click()
                team.get_by_role('button',name="Approve",exact=True).click()
                expect(team.locator('.case-header .badge')).to_have_text('Active')
                frame(team)
                shot(team,'portal-admin-knowledge.png')
                print('Human conversation and knowledge activation checked.',flush=True)
                # Published general knowledge remains private to retrieval, not the public articles endpoint.
                public_articles=client.request.get(BASE+'/api/articles').json()['articles']
                assert all('suivi_personnalise' not in a['content'] for a in public_articles)
                team.get_by_role('button',name="Settings",exact=True).click()
                team.get_by_role('button',name="Test connection",exact=True).click()
                expect(team.get_by_role('alert')).to_contain_text('GROQ_API_KEY')
                team.get_by_label("Confidence threshold",exact=True).fill('0.9')
                team.get_by_role('button',name="Save",exact=True).click()
                expect(team.get_by_text("Threshold saved.",exact=True)).to_be_visible()
                team.get_by_role('button',name="Overview",exact=True).click()
                expect(team.locator('.kpi-value').first).to_have_text('1')
                shot(team,'portal-admin-dashboard.png')
                frame(team)
                client.goto(BASE+'/#requests')
                expect(client.locator('.request-card')).to_have_count(1)
                client.locator('.request-card').first.click()
                expect(client.locator('.message.human').last).to_contain_text('trois rendez-vous')
                client.reload()
                expect(client.locator('.message.human').last).to_contain_text('trois rendez-vous')
                # Desktop and mobile layout, all main pages, no console exceptions.
                client.set_viewport_size({'width':390,'height':844})
                for view in ['home','help','catalog','support','requests','orders']:
                    client.goto(BASE+'/#'+view)
                    expect(client.locator('.portal-header')).to_be_visible()
                    shot(client,f'portal-{view}-mobile.png')
                team.set_viewport_size({'width':390,'height':844})
                for view in ['dashboard','conversations','knowledge','documents','products','customers','settings']:
                    team.goto(BASE+'/admin#'+view)
                    expect(team.get_by_role('heading',name={'dashboard':"Overview",'conversations':"Conversations",'knowledge':"Knowledge",'documents':"Help centre",'products':"Catalogue",'customers':"Customers",'settings':"Settings"}[view],exact=True).first).to_be_visible()
                    overflow(team)
                shot(team,'portal-admin-mobile.png')
                client.get_by_role('button',name="Sign out",exact=True).click()
                expect(client.get_by_role('button',name="My account",exact=True)).to_be_visible()
                client.goto(BASE+'/#requests')
                expect(client.get_by_role('heading',name="Sign in",exact=True)).to_be_visible()
                # Another client never sees the first client's records.
                second=browser.new_context().new_page()
                second.goto(BASE+'/#login')
                second.get_by_role('button',name="Create an account",exact=True).click()
                second.get_by_label("Your name").fill('Autre client')
                second.get_by_label("Email address").fill('portal-other@example.test')
                second.get_by_label("Password").fill(PASSWORD)
                second.get_by_role('button',name="Create my account",exact=True).click()
                expect(second.get_by_role('button',name='Autre',exact=True)).to_be_visible()
                second.goto(BASE+'/#requests')
                expect(second.locator('.request-card')).to_have_count(0)
                if accessibility:
                    count = sum(len(report['violations']) for report in accessibility)
                    print(f"Accessibility: {len(accessibility)} screens checked, {count} rule violations. See .superpowers/portal-check/accessibility.json.")
                    assert count == 0, 'Accessibility issues require review.'
                assert not errors, '\n'.join(errors)
                browser.close()
            if media and frames:
                frames[0].save(MEDIA/'portal-workflow.gif',save_all=True,append_images=frames[1:],duration=2200,loop=0,optimize=True)
                tour[0].save(MEDIA/'portal-tour.gif',save_all=True,append_images=tour[1:],duration=1800,loop=0,optimize=True)
            print('Portal browser checks passed: accounts, permissions, public content, catalog, orders, human handling, reviewed knowledge, persistence and mobile layouts.')
        finally:
            for process in processes:
                process.terminate()
            for process in processes:
                try: process.wait(timeout=10)
                except subprocess.TimeoutExpired: process.kill()
            fixture('clean',env)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--verify-only',action='store_true')
    run(not parser.parse_args().verify_only)
