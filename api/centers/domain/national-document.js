// Canonical Spanish DNI/NIE, including its control letter. No identity is inferred from names.
export function normalizeNationalDocument(value){return typeof value==='string'?value.trim().toUpperCase().replace(/[ .\-]/g,''):''}
export function validNationalDocument(value){
 if(typeof value!=='string'||value.length>40)return false
 const doc=normalizeNationalDocument(value)
 if(!/^(?:[0-9]{8}|[XYZ][0-9]{7})[A-Z]$/.test(doc))return false
 const digits=doc.slice(0,-1).replace(/^[XYZ]/,letter=>String('XYZ'.indexOf(letter)))
 return 'TRWAGMYFPDXBNJZSQVHLCKE'[Number(digits)%23]===doc.at(-1)
}
