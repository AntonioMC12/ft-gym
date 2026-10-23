import TabBar from '../../components/TabBar.jsx'
import {startFlow} from '../../sheets.jsx'
import {useCenterNavigation} from './NavigationGuard.jsx'

export default function CenterTabBar(){
 const requestNavigation=useCenterNavigation()
 return <TabBar onStart={startFlow} requestNavigation={requestNavigation}/>
}
