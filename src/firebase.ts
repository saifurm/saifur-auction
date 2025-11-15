import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAkRzBcjNgviDhfFfK6OBVIi3OyXV9yUsM",
  authDomain: "auction-9bf14.firebaseapp.com",
  projectId: "auction-9bf14",
  storageBucket: "auction-9bf14.firebasestorage.app",
  messagingSenderId: "820607204428",
  appId: "1:820607204428:web:e653708acfde4db44f48e9",
  measurementId: "G-941XK71YPF"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

if (import.meta.env.PROD) {
  isSupported()
    .then((supported) => {
      if (supported) {
        getAnalytics(firebaseApp);
      }
    })
    .catch(() => {
      // ignore analytics errors
    });
}

export { firebaseApp, db };
