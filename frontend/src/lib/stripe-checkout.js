// A second boundary before rendering an external resume link. Never accept an
// app-supplied redirect or persist this bearer URL in personal state/backups.
export function testCheckoutUrl(value){
  if(typeof value!=='string'||value.length>4096)return null
  try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='checkout.stripe.com'&&!url.username&&!url.password&&!url.port&&/^\/(?:c\/)?pay\/cs_test_[a-zA-Z0-9_]+$/.test(url.pathname)?url.href:null}catch{return null}
}
