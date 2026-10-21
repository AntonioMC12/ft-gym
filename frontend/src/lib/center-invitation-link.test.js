// @vitest-environment happy-dom
import {it,expect,vi} from 'vitest'
const platform=vi.hoisted(()=>({mobile:false,base:'https://paired.example.test/gym'}))
vi.mock('./mobile.js',()=>({get MOBILE(){return platform.mobile}}))
vi.mock('./remote.js',()=>({loadRemote:async()=>({base:platform.base})}))
vi.mock('./app-base.js',()=>({appBase:()=>'/myGym/'}))
import {centerInvitationLink} from './center-invitation-link.js'
it('keeps the web subpath and places the code inside the hash route',async()=>{
  platform.mobile=false;expect(await centerInvitationLink('a+b')).toBe(location.origin+'/myGym/#/centers/invite?token=a%2Bb')
})
it('uses the paired server on mobile and refuses a non-http origin',async()=>{
  platform.mobile=true;expect(await centerInvitationLink('code')).toBe('https://paired.example.test/gym/#/centers/invite?token=code')
  platform.base='file:///private';await expect(centerInvitationLink('code')).rejects.toThrow('unavailable')
})
