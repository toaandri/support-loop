import React, { useEffect, useState } from 'react';
import SupportApp from './SupportApp.jsx';
import PortalApp from './PortalApp.jsx';
import { api } from './api.js';
export default function App() {
  const [health,setHealth]=useState(null);
  useEffect(()=>{let active=true;const refresh=()=>api('/health').then((value)=>{if(active)setHealth(value);}).catch(()=>{if(active)setHealth(false);});
    refresh();const timer=setInterval(refresh,15000);return()=>{active=false;clearInterval(timer);};},[]);
  if(health===false) return <div className="app-unavailable" role="alert"><h1>SupportLoop</h1><p>The service is temporarily unavailable.</p><button onClick={()=>location.reload()}>Try again</button></div>;
  if(!health) return <div className="app-unavailable" role="status"><strong>SupportLoop</strong><p>Opening your workspace…</p></div>;
  return health.sessionAuth ? <PortalApp health={health}/> : <SupportApp/>;
}
