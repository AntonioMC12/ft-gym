// Keep credential autofill available; ordinary app fields are not login targets.
// Extension hints are advisory and must be present when the field is created.
export function fieldAutofill(props={}) {
  const credential=props.type==='password'||/(^|\s)(username|current-password|new-password|one-time-code|webauthn)(\s|$)/i.test(props.autoComplete||'')
  if(credential)return props
  return {autoComplete:'off','data-1p-ignore':'true','data-bwignore':'true','data-lpignore':'true',...props}
}
