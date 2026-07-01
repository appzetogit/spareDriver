/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

firebase.initializeApp({
  "apiKey": "AIzaSyAVic9mrzgbnAb9jMMC9n3mc1WWsLorlPA",
  "authDomain": "sparedriver-774ff.firebaseapp.com",
  "projectId": "sparedriver-774ff",
  "storageBucket": "sparedriver-774ff.firebasestorage.app",
  "messagingSenderId": "570049127010",
  "appId": "1:570049127010:web:d220ead30b27278714a73b"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'SpareDriver';
  const options = {
    body: payload?.notification?.body || '',
    data: payload?.data || {},
  };
  self.registration.showNotification(title, options);
});
