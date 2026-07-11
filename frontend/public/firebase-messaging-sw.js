/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

firebase.initializeApp({
  "apiKey": "AIzaSyAEWOflMUIV1tg2x0EqBA13ijdrI79Ard4",
  "authDomain": "sparedriver-d05e7.firebaseapp.com",
  "projectId": "sparedriver-d05e7",
  "storageBucket": "sparedriver-d05e7.firebasestorage.app",
  "messagingSenderId": "635960012035",
  "appId": "1:635960012035:web:1b707672afd8434f2f8d36"
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
