// Reused by billing/notifications and Stripe; independent loops prevent a mail
// failure from delaying payment reconciliation. stop() drains in-flight work.
export function startCentersWorker(tick,{enabled=false,intervalMs=60000,onError=()=>{}}={}) {
  let stopped=false,timer=null,running=null;
  const wake=()=>{if(stopped||running)return;running=Promise.resolve().then(tick).catch(async()=>{
    // A failed observer must not create an unhandled rejection or stop retries.
    try{await onError('centers-jobs-unavailable')}catch{}
  }).finally(()=>{running=null;if(!stopped){timer=setTimeout(wake,intervalMs);timer.unref()}})};
  if(enabled){timer=setTimeout(wake,100);timer.unref()}
  return {async stop(){stopped=true;clearTimeout(timer);await running}};
}
