import { buildLocaleMessages, createMessageCompiler, type CrowdinMessages } from '@modrinth/ui'
import englishUi from '@modrinth/ui/src/locales/en-US/index.json'
import russianUi from '@modrinth/ui/src/locales/ru-RU/index.json'
import { createI18n } from 'vue-i18n'

import englishApp from './locales/en-US/index.json'
import russianApp from './locales/ru-RU/index.json'

/**
 * The launcher is Russian-only; English stays loaded as a fallback for untranslated strings.
 */
export const APP_LOCALE = 'ru-RU'

const i18n = createI18n({
	legacy: false,
	locale: APP_LOCALE,
	fallbackLocale: 'en-US',
	messageCompiler: createMessageCompiler(),
	missingWarn: false,
	fallbackWarn: false,
	messages: buildLocaleMessages({
		'./app/en-US/index.json': { default: englishApp },
		'./ui/en-US/index.json': { default: englishUi },
		[`./app/${APP_LOCALE}/index.json`]: { default: russianApp as CrowdinMessages },
		[`./ui/${APP_LOCALE}/index.json`]: { default: russianUi as CrowdinMessages },
	}),
})

/**
 * Kept for callers that apply a saved locale; the launcher always stays in Russian.
 */
export async function setLocale(_requestedLocale: string): Promise<void> {
	i18n.global.locale.value = APP_LOCALE
}

export default i18n
