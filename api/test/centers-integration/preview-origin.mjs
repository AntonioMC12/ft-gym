// Opt-in fictional preview only; never relax the application's normal CSRF rules.
export function previewOrigin(value='http://localhost:5178'){
  const url=new URL(value);
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||
    !(['http://localhost:5178','http://localhost:5179'].includes(url.origin)||url.protocol==='https:'&&!url.port&&/^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(url.hostname)))throw new Error('unsupported fictional preview origin');
  return url.origin;
}
