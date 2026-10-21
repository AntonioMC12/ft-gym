import ActionReason from './ActionReason.jsx'
import {t} from '../lib/i18n.js'
// Uses the same keyboard/touch/viewport-safe tooltip as disabled-action help.
export default function HelpLabel({title,help,children}){
 return <span className="help-label"><ActionReason reason={t(help)} label={t(title)}><span>{t(title)}{children}</span></ActionReason></span>
}
