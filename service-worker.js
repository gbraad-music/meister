const CACHE_NAME = 'meister-v97';
const ASSETS = [
    './',
    './index.html',
    './meister-controller.js',
    './regroove-pad.js',
    './WAAClock.js',
    './manifest.json',
    './icon.svg',
    // Action system files (v2.0)
    './input-actions.js',
    './action-dispatcher.js',
    './input-mapper.js',
    './meister-actions-integration.js',
    './settings-ui.js',
    // Scene system files
    './fader-components.js',
    './scene-manager.js',
    './svg-slider.js',
    './scene-editor.js',
    // Device management
    './regroove-state.js',
    './device-manager.js'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Caching app assets');
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            // Return cached version or fetch from network
            return response || fetch(event.request).then((fetchResponse) => {
                // Cache new resources
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, fetchResponse.clone());
                    return fetchResponse;
                });
            });
        }).catch(() => {
            // Fallback for offline
            if (event.request.destination === 'document') {
                return caches.match('./index.html');
            }
        })
    );
});
