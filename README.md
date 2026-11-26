# Satyam Singh · Invoice Studio

Open **index.html** in Google Chrome or Microsoft Edge. Keep all six files in the same folder. The application runs directly from the file with no installation, server, or internet connection.

## Payment workflow

1. Create a project with a saved or new client and choose a package. Adjust the services and tax if needed.
2. Open the project and select **Record payment**. Save the advance transaction with its actual amount, date, method and reference. Select **Confirm** on the saved entry after verifying the funds.
3. Select **Advance Payment Receipt** and issue the receipt. It captures the confirmed advance and remaining balance after that advance.
4. After receiving the rest, record a **Final** payment and confirm it separately. The balance reflects confirmed funds only.
5. At zero balance, select **Generate final paid invoice**. The project holds a single final invoice. Find the same document and number in **Invoice History** for additional copies.

Use **Download Customer Invoice**, **Download Office Copy**, or **Print Invoice** to open the browser print dialog. Choose **Save as PDF** as the destination for a PDF. Disable browser headers and footers if your browser has enabled them. Both copies use the same saved figures. The office copy can show internal notes. Upload a signature under **Business Settings** to include your signature image on new documents.

Issued documents preserve the original business, client, project and payment details. Linked payments are locked. Editing an eligible confirmed entry returns it to recorded status for manual confirmation.

## Local data

Records are stored in IndexedDB under the browser profile. Use the same browser profile and file location when reopening. Export a JSON backup regularly from **Backup & Restore**, especially before moving the app or clearing browser data. Importing a backup replaces the current workspace after validation and confirmation.

Press **Alt+N** to start a project.
