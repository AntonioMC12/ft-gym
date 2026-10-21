export function registrationCenterId(){
 try{const value=new URLSearchParams(location.hash.split('?')[1]||'').get('join');return value&&/^[a-zA-Z0-9_-]{1,64}$/.test(value)?value:null}catch{return null}
}
