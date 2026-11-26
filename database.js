'use strict';

const StudioDB = (() => {
  let connection;
  function open() {
    if (!connection) connection = new Promise((resolve, reject) => {
      const request = indexedDB.open('satyam-singh-invoice-studio', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('workspace');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close other Invoice Studio tabs and reopen the app.'));
    });
    return connection;
  }

  async function access(initial, change) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('workspace', change ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('workspace');
      const request = store.get('records');
      let result;
      let failure;
      request.onsuccess = () => {
        try {
          const current = request.result ?? initial();
          result = change ? change(current) ?? current : current;
          if (change) store.put(result, 'records');
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Local storage transaction failed.'));
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not access local records.'));
    });
  }

  return { access };
})();
