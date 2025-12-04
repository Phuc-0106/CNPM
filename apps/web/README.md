# BKTutor static web

Plain HTML, CSS, and JavaScript served from `www` with shared assets in `static`.

## Layout
- `www/index.html` — landing page
- `www/login.html` — login form
- `www/student.html` — student home (browse sessions, cart, messaging)
- `www/profile.html` — student profile (bookings, progress, edit profile)
- `wwww/tutor_profile.html` — tutor profile (informations, languages, bio, modes, skills, support courses)
- `www/tutor_management_page.html` — Schedule & Request Sessions
- `www/tutor_manage_session.html` — Detail Sessions
- `www/admin.html` — Admin features
- `static/css/main.css` — styles
- `static/js` — page-specific scripts
- `static/images` — shared images and logo


## Local preview
```bash
npm install
npm run serve   # serves ./www on http://localhost:5173
```

## Demo login
- Email: `student@hcmut.edu.vn`
- Password: `demo123`
- Email: `tutor@hcmut.edu.vn`
- Password: `tutor123`
- Email: `admin@hcmut.edu.vn`
- Password: `admin123`
