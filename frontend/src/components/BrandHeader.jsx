import { BRAND_NAME } from '../lib/brand.js'
import { appBase } from '../lib/app-base.js'

export default function BrandHeader({ compact = false }) {
  return compact ? <div className="ft-brand-strip">
    <img src={appBase() + 'brand/ft-icon-192.png'} alt="" width="32" height="32" />
    <span>{BRAND_NAME}</span>
  </div> : <header className="ft-brand-header">
    <img className="ft-brand-hero" src={appBase() + 'brand/ft-hero-training.png'} alt="" />
    <h1>{BRAND_NAME}</h1>
  </header>
}
