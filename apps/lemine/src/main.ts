import './styles/base.css'
import 'dayjs/locale/ru'

import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { createApp } from 'vue'

import App from './App.vue'
import { vTip } from './directives/tooltip'
import { router } from './router'

dayjs.extend(relativeTime)
dayjs.locale('ru')

createApp(App).use(router).directive('tip', vTip).mount('#app')
