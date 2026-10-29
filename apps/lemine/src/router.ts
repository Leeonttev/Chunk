import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
	history: createWebHistory(),
	routes: [
		{ path: '/', redirect: '/instances' },
		{ path: '/settings', name: 'settings', component: () => import('./pages/SettingsPage.vue') },
		{ path: '/wardrobe', name: 'wardrobe', component: () => import('./pages/WardrobePage.vue') },
		{ path: '/instances', name: 'instances', component: () => import('./pages/InstancesPage.vue') },
		{
			path: '/instance/:id',
			name: 'instance',
			component: () => import('./pages/InstancePage.vue'),
			props: true,
		},
		{ path: '/catalog', name: 'catalog', component: () => import('./pages/CatalogPage.vue') },
		{
			path: '/catalog/:id',
			name: 'project',
			component: () => import('./pages/ProjectPage.vue'),
			props: true,
		},
		{
			path: '/screenshots',
			name: 'screenshots',
			component: () => import('./pages/ScreenshotsPage.vue'),
		},
		{ path: '/:pathMatch(.*)*', redirect: '/' },
	],
})
