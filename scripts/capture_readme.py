"""Isolated browser regression and reproducible README media from real demo flows."""
import argparse
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import urllib.request
from PIL import Image
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / 'docs' / 'media'
ARTIFACTS = ROOT / '.superpowers' / 'browser-check'
BACKEND_PORT = int(os.environ.get('CAPTURE_BACKEND_PORT', 3101))
FRONTEND_PORT = int(os.environ.get('CAPTURE_FRONTEND_PORT', 5180))
BASE = f'http://127.0.0.1:{FRONTEND_PORT}'
API = f'http://127.0.0.1:{BACKEND_PORT}/api'

def request(path, body=None, support=False):
    payload = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(API + path, data=payload, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=15) as res:
        return json.load(res)

def wait_ready(url, processes):
    deadline = time.monotonic() + 40
    while time.monotonic() < deadline:
        for process in processes:
            if process.poll() is not None:
                raise RuntimeError('Demo process exited. See .superpowers/browser-check logs.')
        try:
            with urllib.request.urlopen(url, timeout=1) as res:
                if res.status == 200:
                    return
        except (OSError, TimeoutError):
            time.sleep(.2)
    raise RuntimeError(f'Server did not become ready: {url}')

def screenshot(page, name, enabled):
    if enabled:
        page.screenshot(path=str(MEDIA / name), full_page=True, animations='disabled')

def frame(page, frames, enabled):
    if enabled:
        frames.append(Image.open(io.BytesIO(page.screenshot(animations='disabled'))).convert('RGB').resize((1080, 768)))

def seed_activity():
    scenarios = [('capture-order', 'Où est ma commande ORD-1001 ?'), ('capture-stock', 'Stock PRD-001 ?'),
                 ('capture-delivery', 'Quels sont les délais de livraison ?'), ('capture-return', 'Je souhaite un remboursement'),
                 ('capture-human', 'Je veux parler à un humain')]
    for cid, message in scenarios:
        request('/chat', {'conversationId': cid, 'message': message, 'channel': 'web'})
    request('/support/conversations/capture-return/claim', {})
    request('/support/conversations/capture-return/reply', {'content': 'Une commande expédiée ne peut pas être annulée. Vous pouvez demander un retour après la livraison, sous 14 jours.'})
    request('/support/conversations/capture-return/resolve', {})

def run(media):
    MEDIA.mkdir(parents=True, exist_ok=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, 'PORT': str(BACKEND_PORT), 'AGENT_MODE': 'demo', 'STORAGE_MODE': 'memory',
           'HOST': '127.0.0.1', 'DEMO_MODE': 'true', 'AUTH_MODE': 'keys', 'CUSTOMER_API_KEY': '', 'SUPPORT_ADMIN_KEY': '', 'VITE_API_BASE_URL': '', 'OPENAI_API_KEY': ''}
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node.js is required.')
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    errors, frames, tour = [], [], []
    with (ARTIFACTS / 'backend.log').open('w', encoding='utf-8') as blog, (ARTIFACTS / 'frontend.log').open('w', encoding='utf-8') as flog:
        processes = [subprocess.Popen([node, 'src/server.js'], cwd=ROOT / 'backend', env=env, stdout=blog, stderr=blog, creationflags=flags),
                     subprocess.Popen([node, 'node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', str(FRONTEND_PORT), '--strictPort'],
                                      cwd=ROOT / 'frontend', env=env, stdout=flog, stderr=flog, creationflags=flags)]
        try:
            wait_ready(API + '/health', processes)
            wait_ready(BASE, processes)
            seed_activity()
            with sync_playwright() as p:
                browser = p.chromium.launch()
                context = browser.new_context(viewport={'width': 1440, 'height': 1024}, reduced_motion='reduce')
                client = context.new_page()
                client.on('pageerror', lambda err: errors.append(str(err)))
                client.goto(BASE + '/#dashboard')
                expect(client.locator('.kpi-value').first).to_have_text('5')
                screenshot(client, 'dashboard.png', media)
                frame(client, tour, media)
                client.get_by_role('button', name='Conversation client', exact=True).click()
                expect(client.get_by_role('heading', name='Camille Martin', exact=True)).to_be_visible()
                client.get_by_role('button', name='Nouvelle conversation', exact=True).click()
                screenshot(client, 'client.png', media)
                frame(client, frames, media)
                client.get_by_role('textbox', name='Message client').fill('Comment fonctionne la garantie atelier ?')
                client.get_by_role('button', name='Envoyer', exact=True).click()
                expect(client.locator('.chat-header .badge')).to_have_text('En attente')
                frame(client, frames, media)
                support = context.new_page()
                support.on('pageerror', lambda err: errors.append(str(err)))
                support.goto(BASE + '/#conversations')
                row = support.locator('.queue-row').filter(has_text='Comment fonctionne la garantie atelier').first
                expect(row).to_be_visible()
                row.click()
                support.get_by_role('button', name='Prendre en charge', exact=True).click()
                answer = 'La garantie atelier dure deux ans. Présentez votre justificatif d’achat pour demander une réparation.'
                support.get_by_role('textbox', name='Réponse conseiller').fill(answer)
                support.get_by_role('button', name='Envoyer', exact=True).click()
                expect(client.locator('.message.human').last).to_contain_text('deux ans')
                expect(client.locator('.chat-header .badge')).to_have_text('Conseiller')
                screenshot(support, 'conversations.png', media)
                frame(support, frames, media)
                frame(support, tour, media)
                # Keep the final case visible in mobile captures as well.
                support.get_by_role('button', name='Résoudre', exact=True).click()
                expect(support.locator('.case-header .badge')).to_have_text('Résolue')
                support.get_by_role('button', name='Connaissances', exact=True).click()
                support.locator('.queue-row').filter(has_text='Comment fonctionne la garantie atelier').first.click()
                support.get_by_role('button', name='Réviser', exact=True).click()
                expect(support.locator('.case-header .badge')).to_have_text('En révision')
                screenshot(support, 'knowledge.png', media)
                frame(support, frames, media)
                frame(support, tour, media)
                support.get_by_role('button', name='Éditer', exact=True).click()
                support.get_by_role('textbox', name='Règle JSON').fill(json.dumps({'intent':'garantie_atelier','condition':'Demande de garantie atelier','resolution':'Garantie de deux ans, sur justificatif', 'notes':None}, ensure_ascii=False))
                support.get_by_role('button', name='Sauvegarder', exact=True).click()
                expect(support.locator('.knowledge-rule')).to_contain_text('garantie_atelier')
                screenshot(support, 'knowledge.png', media)
                frame(support, frames, media)
                support.get_by_role('button', name='Approuver', exact=True).click()
                expect(support.locator('.case-header .badge')).to_have_text('Active')
                frame(support, frames, media)
                client.get_by_role('button', name='Nouvelle conversation', exact=True).click()
                client.get_by_role('textbox', name='Message client').fill('Comment fonctionne la garantie atelier ?')
                client.get_by_role('button', name='Envoyer', exact=True).click()
                expect(client.locator('.message.assistant').last).to_contain_text('deux ans')
                expect(client.locator('.chat-header .badge')).to_have_text('Automatique')
                expect(client.get_by_text('Connaissance validée', exact=False)).to_be_visible()
                screenshot(client, 'learned-answer.png', media)
                frame(client, frames, media)
                frame(client, tour, media)
                # Orders, keyboard sending and sources remain operational after learning.
                client.get_by_role('textbox', name='Message client').fill('Où est ma commande ORD-1001 ?')
                client.get_by_role('textbox', name='Message client').press('Enter')
                expect(client.locator('.message.assistant').last).to_contain_text('DEMO-TRACK-1001')
                client.get_by_role('button', name='Nouvelle conversation', exact=True).click()
                client.get_by_role('textbox', name='Message client').fill('Je veux parler à un humain')
                client.get_by_role('button', name='Envoyer', exact=True).click()
                expect(client.locator('.chat-header .badge')).to_have_text('En attente')
                cid = client.evaluate("localStorage.getItem('support-loop-conversation-id')")
                support.get_by_role('button', name='Conversations', exact=True).click()
                support.get_by_role('combobox', name='Filtrer les conversations').select_option('waiting')
                support.locator(f'[data-conversation-id="{cid}"]').click()
                support.get_by_role('button', name='Prendre en charge', exact=True).click()
                expect(client.locator('.chat-header .badge')).to_have_text('Conseiller')
                count = client.locator('.message.assistant').count()
                client.get_by_role('textbox', name='Message client').fill('Voici une précision pour le conseiller.')
                client.get_by_role('button', name='Envoyer', exact=True).click()
                expect(support.locator('.message.user').last).to_contain_text('une précision')
                assert client.locator('.message.assistant').count() == count, 'AI replied during human handoff'
                support.get_by_role('button', name="Reprendre avec l'IA", exact=True).click()
                expect(client.locator('.chat-header .badge')).to_have_text('Automatique')
                client.get_by_role('button', name='Catalogue', exact=True).click()
                expect(client.locator('.product')).to_have_count(2)
                for img in client.locator('.product img').all():
                    img.evaluate('(img) => img.decode()')
                    assert img.evaluate('(img) => img.naturalWidth > 0')
                screenshot(client, 'catalog.png', media)
                frame(client, tour, media)
                client.get_by_role('textbox', name='Rechercher un produit').fill('Casque')
                expect(client.locator('.product')).to_have_count(1)
                client.get_by_role('textbox', name='Rechercher un produit').fill('')
                for width in [390, 768, 1440]:
                    client.set_viewport_size({'width': width, 'height': 844 if width < 1440 else 1024})
                    for view in ['dashboard', 'chat', 'conversations', 'knowledge', 'catalog']:
                        client.goto(BASE + '/#' + view)
                        expect(client.locator('h1')).to_be_visible()
                        expect(client.locator('.connection')).not_to_contain_text('Connexion')
                        assert client.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), f'Horizontal overflow: {view} at {width}'
                        if width == 390:
                            screenshot(client, f'{view}-mobile.png', media)
                client.get_by_role('button', name='Guide de démonstration', exact=True).click()
                expect(client.get_by_role('dialog')).to_be_visible()
                expect(client.get_by_role('button', name='Fermer le guide', exact=True)).to_be_focused()
                client.keyboard.press('Shift+Tab')
                expect(client.get_by_role('button', name='Essayer le parcours', exact=True)).to_be_focused()
                client.keyboard.press('Tab')
                expect(client.get_by_role('button', name='Fermer le guide', exact=True)).to_be_focused()
                client.get_by_role('button', name='Fermer le guide', exact=True).click()
                expect(client.get_by_role('dialog')).not_to_be_visible()
                # Restart the isolated backend with protected routes and test both login surfaces.
                processes[0].terminate()
                processes[0].wait(timeout=5)
                protected_env = {**env, 'DEMO_MODE': 'false', 'CUSTOMER_API_KEY': 'fixture-customer', 'SUPPORT_ADMIN_KEY': 'fixture-admin'}
                processes[0] = subprocess.Popen([node, 'src/server.js'], cwd=ROOT / 'backend', env=protected_env,
                                                stdout=blog, stderr=blog, creationflags=flags)
                wait_ready(API + '/health', processes)
                client.goto(BASE + '/#dashboard')
                expect(client.get_by_role('heading', name='Accès conseiller')).to_be_visible()
                client.get_by_label("Clé d'accès", exact=True).fill('wrong-fixture')
                client.get_by_role('button', name='Connexion', exact=True).click()
                expect(client.get_by_role('alert')).to_contain_text('incorrecte')
                client.get_by_label("Clé d'accès", exact=True).fill('fixture-admin')
                client.get_by_role('button', name='Connexion', exact=True).click()
                expect(client.locator('.kpi-value').first).to_have_text('0')
                client.get_by_role('button', name='Conversation client', exact=True).click()
                expect(client.get_by_label('Clé d’accès client', exact=True)).to_be_visible()
                client.get_by_label('Clé d’accès client', exact=True).fill('fixture-customer')
                client.get_by_role('button', name='Se connecter', exact=True).click()
                expect(client.get_by_role('heading', name='Camille Martin', exact=True)).to_be_visible()
                client.get_by_role('textbox', name='Message client').fill('Stock PRD-001 ?')
                client.get_by_role('button', name='Envoyer', exact=True).click()
                expect(client.locator('.message.assistant').last).to_contain_text('12 en stock')
                assert not errors, errors
                browser.close()
            if media:
                for name, images in [('learning-loop.gif', frames), ('workspace-tour.gif', tour)]:
                    palette = [img.quantize(colors=128) for img in images]
                    palette[0].save(MEDIA / name, save_all=True, append_images=palette[1:], duration=1900, loop=0, optimize=True)
            print('PASS: customer chat, order tools, human handoff/reply/resolve/resume, paused AI, review/edit/approval, learned reuse, sources, catalog search, keyboard guide, protected logins, layouts at 390/768/1440, no browser exceptions.')
        finally:
            for process in processes:
                process.terminate()
            for process in processes:
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    run(not args.verify_only)
