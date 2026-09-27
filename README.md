# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
# WriteCheck

## Run YOLO–TrOCR locally

Run `npm start`, then open `http://localhost:3000/transcribe` to upload a handwritten
image and see the transcription arrive line by line. This standalone preview does
not require Supabase login or call the plagiarism API. Classroom routes continue
to require authentication.

Enable the preview in `backend/.env` with `LOCAL_OCR_ENABLED=1`. The preview endpoint
accepts only loopback clients and local browser origins; it is disabled by default.
Use `localhost` on the same computer as the backend. Both model paths must point to
the installed YOLO weights and TrOCR model folder.

For this two-core CPU machine, `OCR_BATCH_SIZE=2` and `TORCH_THREADS=2` reduce memory
pressure and show progress after each line. A full page can still take several
minutes on CPU. Keep the page upright and well lit, and review the recognized text.
Adjacent YOLO lines are kept separate by default. `OCR_JOIN_SPLIT_LINES=1` enables
the experimental repair heuristic, which can incorrectly merge ruled-paper lines.

## Profile editing and password recovery

- Run section 7 of `supabase_schema.sql` in Supabase SQL Editor to install `update_my_profile`. This function edits only the signed-in user's full name; email and role remain read-only in the profile form.
- In Supabase Authentication > URL Configuration, add `http://localhost:3000/reset-password` for local development and `https://YOUR_APP_DOMAIN/reset-password` for production to Redirect URLs. Set Site URL to your app's deployed origin.
- Configure email delivery in Supabase for production password recovery. Ensure the hosting service serves the React app for `/forgot-password` and `/reset-password` as well as `/dashboard`.
- Test with a real registered student and teacher: edit the name, reload, request a password reset from Login, follow the email link, save matching passwords, then sign out and sign in with the new password. Sample SQL-only profiles do not have Auth accounts and cannot reset a login password.

## Admin workspace

See [ADMIN_SETUP.md](ADMIN_SETUP.md) for the database migration, admin account assignment,
API endpoints, local setup, security boundaries, and verification checklist. Apply
`admin_schema.sql` after `supabase_schema.sql` before deploying the admin-enabled
frontend/backend. Administrative routes start at `/admin/dashboard`.
