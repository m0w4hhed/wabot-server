const firebase = require('firebase');
const { collectionData, doc } = require('rxfire/firestore');

const firebaseConfig = {
    apiKey: "AIzaSyAaC_P9vm-hnCA0TqejEgYeySKLMawYOnY",
    authDomain: "nabiilah-data.firebaseapp.com",
    databaseURL: "https://nabiilah-data.firebaseio.com",
    projectId: "nabiilah-data",
    storageBucket: "nabiilah-data.appspot.com",
    messagingSenderId: "615070425907",
    appId: "1:615070425907:web:b12c26b41e1231f9",
    measurementId: "G-N81YYZ3X5H"
};
var fire = firebase.initializeApp(firebaseConfig);
var firestore = fire.firestore();

const getData = (docPath) => {
    const docRef = firestore.doc(docPath);
    return doc(docRef);
};
const getDatas = (collectionPath) => {
    const colRef = firestore.collection(collectionPath);
    return collectionData(colRef, 'id');
};
/**
 * @example
 * fireData = [
 *  { path: 'col/doc', partialData?: {...data}, delete?: false }
 * ]
 */
const setDatas = (fireData) => {
    const batch = firestore.batch();
    fireData.forEach(f => {
        const docRef = firestore.doc(f.path);
        if (!f.delete) {
            batch.set(docRef, f.partialData, {merge: true});
        } else { batch.delete(docRef); }
    });
    return batch.commit();
};

module.exports = {
    getDatas, setDatas, getData
};