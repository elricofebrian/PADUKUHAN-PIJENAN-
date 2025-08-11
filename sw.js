/**
 * Service Worker untuk Aplikasi Padukuhan Pijenan
 * Dikembangkan oleh: ELRICO FEBRIAN
 */

const CACHE_NAME = 'padukuhan-pijenan-v1.0.0';
const OFFLINE_URL = '/offline.html';

// Files to cache for offline functionality
const STATIC_CACHE_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/images/logo.png',
  '/assets/images/icon-192x192.png',
  '/assets/images/icon-512x512.png',
  '/offline.html'
];

// Dynamic cache patterns
const CACHE_PATTERNS = {
  images: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
  styles: /\.css$/,
  scripts: /\.js$/,
  api: /\/api\//
};

// Install event - cache static files
self.addEventListener('install', event => {
  console.log('[SW] Install event');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching static files');
        return cache.addAll(STATIC_CACHE_FILES);
      })
      .then(() => {
        console.log('[SW] Static files cached successfully');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Pre-caching failed:', error);
      })
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activate event');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => cacheName !== CACHE_NAME)
            .map(cacheName => {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[SW] Cache cleanup completed');
        return self.clients.claim();
      })
  );
});

// Fetch event - handle network requests
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension requests
  if (event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  event.respondWith(
    handleFetchRequest(event.request)
  );
});

async function handleFetchRequest(request) {
  const url = new URL(request.url);
  
  try {
    // Try network first for API calls
    if (CACHE_PATTERNS.api.test(url.pathname)) {
      return await networkFirst(request);
    }
    
    // Cache first for static assets
    if (CACHE_PATTERNS.images.test(url.pathname) ||
        CACHE_PATTERNS.styles.test(url.pathname) ||
        CACHE_PATTERNS.scripts.test(url.pathname)) {
      return await cacheFirst(request);
    }
    
    // Network first for HTML pages
    if (url.pathname.endsWith('.html') || url.pathname === '/') {
      return await networkFirst(request);
    }
    
    // Default: try cache first, then network
    return await cacheFirst(request);
    
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

// Background sync for offline actions
self.addEventListener('sync', event => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'background-sync-aspirasi') {
    event.waitUntil(syncAspirations());
  } else if (event.tag === 'background-sync-chat') {
    event.waitUntil(syncChatMessages());
  } else if (event.tag === 'background-sync-news') {
    event.waitUntil(syncNewsData());
  }
});

// Sync functions
async function syncAspirations() {
  try {
    console.log('[SW] Syncing offline aspirations');
    
    const offlineAspirations = await getOfflineData('offline_aspirations');
    
    if (offlineAspirations && offlineAspirations.length > 0) {
      for (const aspirasi of offlineAspirations) {
        await fetch('/api/aspirations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(aspirasi)
        });
      }
      
      // Clear offline data after successful sync
      await clearOfflineData('offline_aspirations');
      console.log('[SW] Offline aspirations synced successfully');
    }
  } catch (error) {
    console.error('[SW] Failed to sync aspirations:', error);
  }
}

async function syncChatMessages() {
  try {
    console.log('[SW] Syncing offline chat messages');
    
    const offlineMessages = await getOfflineData('offline_messages');
    
    if (offlineMessages && offlineMessages.length > 0) {
      for (const message of offlineMessages) {
        await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message)
        });
      }
      
      await clearOfflineData('offline_messages');
      console.log('[SW] Offline messages synced successfully');
    }
  } catch (error) {
    console.error('[SW] Failed to sync messages:', error);
  }
}

async function syncNewsData() {
  try {
    console.log('[SW] Syncing news data');
    
    const response = await fetch('/api/news');
    const newsData = await response.json();
    
    // Update cached news data
    const cache = await caches.open(CACHE_NAME);
    cache.put('/api/news', new Response(JSON.stringify(newsData)));
    
    console.log('[SW] News data synced successfully');
  } catch (error) {
    console.error('[SW] Failed to sync news data:', error);
  }
}

// Push notification handler
self.addEventListener('push', event => {
  console.log('[SW] Push notification received');
  
  const options = {
    body: 'Ada berita penting dari Padukuhan Pijenan',
    icon: '/assets/images/icon-192x192.png',
    badge: '/assets/images/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Buka Aplikasi',
        icon: '/assets/images/checkmark.png'
      },
      {
        action: 'close',
        title: 'Tutup',
        icon: '/assets/images/xmark.png'
      }
    ]
  };

  if (event.data) {
    const notificationData = event.data.json();
    options.body = notificationData.message || options.body;
    options.data = { ...options.data, ...notificationData };
  }

  event.waitUntil(
    self.registration.showNotification('Padukuhan Pijenan', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification click received');
  
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  } else if (event.action === 'close') {
    // Just close the notification
    return;
  } else {
    // Default action - open the app
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        if (clientList.length > 0) {
          return clientList[0].focus();
        }
        return clients.openWindow('/');
      })
    );
  }
});

// Helper functions for offline data management
async function getOfflineData(key) {
  try {
    const cache = await caches.open(`${CACHE_NAME}-data`);
    const response = await cache.match(`/offline-data/${key}`);
    
    if (response) {
      return await response.json();
    }
    
    return null;
  } catch (error) {
    console.error('[SW] Failed to get offline data:', error);
    return null;
  }
}

async function saveOfflineData(key, data) {
  try {
    const cache = await caches.open(`${CACHE_NAME}-data`);
    const response = new Response(JSON.stringify(data));
    
    await cache.put(`/offline-data/${key}`, response);
    console.log('[SW] Offline data saved:', key);
  } catch (error) {
    console.error('[SW] Failed to save offline data:', error);
  }
}

async function clearOfflineData(key) {
  try {
    const cache = await caches.open(`${CACHE_NAME}-data`);
    await cache.delete(`/offline-data/${key}`);
    console.log('[SW] Offline data cleared:', key);
  } catch (error) {
    console.error('[SW] Failed to clear offline data:', error);
  }
}

// Periodic background sync
self.addEventListener('periodicsync', event => {
  if (event.tag === 'news-sync') {
    event.waitUntil(syncNewsData());
  }
});

// Handle app updates
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Error handling
self.addEventListener('error', event => {
  console.error('[SW] Global error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('[SW] Unhandled rejection:', event.reason);
});

console.log('[SW] Service Worker loaded successfully - Padukuhan Pijenan v1.0.0');
    console.error('[SW] Fetch failed:', error);
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_URL);
    }
    
    // Return a generic offline response
    return new Response('Offline - Content not available', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Cache first strategy
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    console.log('[SW] Cache hit:', request.url);
    return cachedResponse;
  }
  
  console.log('[SW] Cache miss, fetching from network:', request.url);
  const networkResponse = await fetch(request);
  
  // Cache the response if it's successful
  if (networkResponse.status === 200) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, networkResponse.clone());
  }
  
  return networkResponse;
}

// Network first strategy
async function networkFirst(request) {
  try {
    console.log('[SW] Network first:', request.url);
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
    
  }