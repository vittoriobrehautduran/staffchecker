# Staff Checker - Project Plan

## Project Overview
A web application for tennis club workers to report their monthly hours worked. Workers can log in, view a calendar, and enter their hours for each day they worked during the month.

---

## Core Functionality

### 1. Data Entry Requirements
Workers must enter:
- **Date** - The date they worked
- **Time range** - Hours worked from X to X in **24-hour format** (e.g., "08:00 to 12:00" or "14:00 to 17:00")
  - This allows tracking specific time periods worked, not just total hours
  - Each entry can have a start time and end time
  - Format: HH:MM (24-hour, e.g., 08:00, 14:30, 17:00)
- **Work type** - What they worked with:
  - Cafe
  - Coaching
  - Administration
  - Cleaning
  - Annat (Other) - **only shows text field when "Annat" is selected** to specify what "other" work was done
- **Övrig kommentar** (Other comment) - Optional text field for additional notes

**Multiple entries per date**: Workers can add multiple "slots" (entries) for the same date. Each slot can have different time ranges, work type, and comments. This allows workers to log, for example, cafe work from 08:00-12:00 and coaching from 14:00-17:00 on the same day.

**Entry display**: Multiple entries for a date are displayed as **cards** in the modal.

**Entry structure clarification**: 
- Each entry = one time slot with:
  - Start time (from X)
  - End time (to X)
  - Work type
  - Optional comment
- Each entry has its own calculated hours (e.g., 08:00-12:00 = 4 hours)
- Total for a date = sum of all entry hours for that date
- Example: Date 2024-01-15 has Entry 1 (08:00-12:00, Cafe, 4h) and Entry 2 (14:00-17:00, Coaching, 3h) → Total for date = 7 hours

### 2. Report Structure
- **Monthly reports** - Workers fill out hours for the entire month
- **Preview/Förhandsvisning**: 
  - Before submitting, workers can view a preview/summary of their report
  - Shows the complete report format:
    - **Month and year** (e.g., "January 2024")
    - For each date with entries:
      - **Date** (e.g., "2024-01-15")
      - For each entry on that date:
        - **Time range**: From X to X (e.g., "08:00 to 12:00")
        - **Work type**: Cleaning, Administration, Cafe, Coaching, or Annat
        - **Hours for this entry**: Calculated from time range (e.g., 4 hours)
      - **Total hours for that date**: Sum of all entries for that date
  - Example display:
    ```
    January 2024
    
    2024-01-15
    - 08:00 to 12:00 (Cafe) - 4 hours
    - 14:00 to 17:00 (Coaching) - 3 hours
    Total for date: 7 hours
    
    2024-01-16
    - 09:00 to 13:00 (Administration) - 4 hours
    Total for date: 4 hours
    ```
  - Allows workers to review before final submission
- **Submission methods**:
  1. **Manual submission** - "Submit Report" button that:
     - Locks the month
     - Sends email to boss immediately
     - Stores report in database
  2. **Automatic submission** - If worker hasn't manually submitted:
     - Report is automatically emailed to boss on the **2nd of the next month** (if there are any entries)
     - Report is stored in database
     - Month becomes locked/read-only
- **Edit restrictions**:
  - Workers **can edit, add, and delete entries** for the current month before submission
  - Workers **cannot edit past reports** once they have been sent (after the 2nd or after manual submission)
  - After the automatic send date (2nd of next month), past months become **read-only**
  - Workers can still view everything in the calendar, but cannot modify past months after report is sent
- **Validation** - Minimum requirement: at least one hour entry (one "slot") before submitting the report

### 3. User Roles (Phase 1)
- **Workers only** - Can create and submit their own monthly reports
- **Admin/Boss view** - Will be added in a later phase (not in initial build)

---

## User Experience & UI

### 4. Authentication
- **Clerk** - Use Clerk for registration and login
- **Registration requirements** (required fields):
  - Email
  - Name + Last name (separate fields or combined)
  - Personnummer (Swedish personal identity number)
- **Login method**: 
  - Workers log in using their **full personnummer**
  - Input field should mask the **last 4 digits** as they type (show dots/asterisks: `****`)
  - Example: Personnummer `199001011234` → login with full number, displayed as `19900101****`
- **Profile storage**: 
  - Full personnummer, name, last name, and email are stored in Neon database
  - This information is entered once during registration and used for all future reports
  - After initial setup, workers just log in with full personnummer (last 4 digits masked), fill out forms, and log out

**Clerk Implementation - Option 1 (Selected)**: 
- Use Clerk's standard email/password authentication
- During registration: User enters email, name, last name, personnummer, and sets a password
- Store personnummer in Neon database
- Custom login UI:
  1. User enters full personnummer (last 4 digits masked as they type: `19900101****`)
  2. Query Neon database to find user by full personnummer
  3. Retrieve associated email
  4. Use Clerk's `signIn.create()` API with email
  5. Clerk handles password verification
- **Implementation**: Secure, uses Clerk's built-in password management

### 5. Calendar Interface
- **Calendar view** showing:
  - Current month
  - Past months (for viewing/historical reference)
  - **Navigation**: Workers can only navigate to past and current months (not future months)
  - Weekdays (veckodag) displayed
- **Interaction flow**:
  1. Worker clicks on a date in the calendar
  2. Popup/modal window appears showing:
     - **Existing entries displayed as cards** (if any entries exist for that date)
     - Each card shows:
       - Time range (from X to X)
       - Work type
       - Annat specification (if applicable)
       - Comment (if provided)
       - Edit and Delete buttons (if month is not locked)
     - **Add new entry section** with:
       - **Time range**: "From" time input and "To" time input (e.g., 08:00 to 12:00)
       - **Arbete** (Work type) dropdown/selection
         - **Only when "Annat" is selected**: Show optional text field to specify what "other" work was
       - **Övrig kommentar** (Other comment) text field (optional)
     - "Add entry" or "Save" button
  3. Worker fills in the information and saves
  4. Date is marked/indicated as having hours entered
  5. Workers can add multiple slots per date by filling the form and clicking "Add entry" again

### 6. Validation Rules
- **Required**: Minimum one hour entry (one "slot") before submitting the monthly report
- **No maximum hours** restriction
- **Multiple entries allowed**: Workers can add multiple slots/entries for the same date

---

## Technical Stack

### 7. Frontend
- **React** with **TypeScript**
- **Build tool**: Vite
- **Package manager**: npm
- **Routing**: React Router
- **State management**: React Context API
- **Forms**: React Hook Form
- **Date handling**: date-fns
- **UI components**: Shadcn UI (Radix UI + Tailwind)
- **HTTP client**: Native fetch API
- **Tailwind CSS** for styling
- **Color scheme**:
  - Primary: White and Blue
  - Accent: Red and Black (for some elements)

### 8. Backend & Database
- **Backend**: Netlify Functions (API routes)
- **Database**: **Neon** - PostgreSQL database for storing:
  - User profiles (name, last_name, personnummer, email) - entered once during registration
  - Monthly reports (with submission status and date)
  - Hour entries (slots) per date - each entry stores:
    - Date
    - Time from (start time, e.g., 08:00)
    - Time to (end time, e.g., 12:00)
    - Work type
    - Annat specification (if applicable)
    - Comment
    - User ID reference
  - Report submission tracking (draft vs submitted, submission date)
- **Database access**: Direct SQL queries using Neon serverless driver (`@neondatabase/serverless`)
- **No ORM**: Using direct SQL for simplicity and control

#### Database Schema (Proposed)
```
users
- id (primary key)
- clerk_user_id (from Clerk)
- name
- last_name
- personnummer (full, for lookup)
- email
- created_at
- updated_at

reports
- id (primary key)
- user_id (foreign key → users)
- month (1-12)
- year
- status (draft, submitted)
- submitted_at (timestamp, nullable)
- created_at
- updated_at

entries
- id (primary key)
- report_id (foreign key → reports)
- date (date)
- time_from (time, e.g., 08:00)
- time_to (time, e.g., 12:00)
- work_type (enum: cafe, coaching, administration, cleaning, annat)
- annat_specification (text, nullable)
- comment (text, nullable)
- created_at
- updated_at
```

#### Database Structure Example
Each entry (slot) is stored as a **separate row** in the database. For example:
- User works on 2024-01-15:
  - Entry 1: Cafe, 08:00-12:00
  - Entry 2: Coaching, 14:00-17:00
- This creates **2 separate rows** in the `entries` table for the same date
- When generating reports, entries are grouped by date and month

### 9. Report Format (Sent to Boss)
When a report is submitted (manually or automatically), the following data is sent:

**Worker Information:**
- Name
- Email
- Personnummer

**Delivery**: 
- **Email**: Sent automatically to boss's email address via AWS SES
  - Manual submission: Email sent immediately when worker clicks "Submit Report"
  - Automatic submission: Email sent on 2nd of next month if worker hasn't manually submitted
- **Database**: Report is always stored in Neon database

**Report Data Format:**
- Month and Year
- List of all dates with entries, showing:
  - Date
  - For each entry:
    - Time range (from X to X in 24-hour format)
    - Work type (Cafe, Coaching, Administration, Cleaning, or Annat)
    - Hours for that entry (calculated from time range)
  - Total hours for that date (sum of all entries)
- Example format:
  ```
  January 2024
  
  2024-01-15
  - 08:00 to 12:00 (Cafe) - 4 hours
  - 14:00 to 17:00 (Coaching) - 3 hours
  Total for date: 7 hours
  
  2024-01-16
  - 09:00 to 13:00 (Administration) - 4 hours
  Total for date: 4 hours
  ```

### 10. Email Reminders (Future Feature)
- Send reminders to **all workers** who have accounts
- **Timing**: Reminders sent on the **2nd of each month** (start of next month)
- **Message**: Reminder to not forget to send their hours worked report
- **Note**: This is separate from the automatic report email. Reminders are to prompt workers, while auto-email sends the actual report if not manually submitted.
- **Implementation**: Automated system that runs on the 2nd of each month
- **Email service**: AWS SES

### 11. Deployment
- **Netlify** - Hosting platform

---

## Tech Stack - Finalized

### Frontend Framework & Build
- **TypeScript** - For type safety and better developer experience
- **React** - UI framework
- **Vite** - Build tool and dev server
- **npm** - Package manager
- **React Router** - Client-side routing (`/login`, `/dashboard`, `/report`, etc.)

### State Management
- **React Context API** - Built-in state management for user data, calendar state, entries, and reports
- **useState/useReducer** - For local component state

### Form Handling
- **React Hook Form (RHF)** - For registration, login, and entry modal forms
- Provides validation, performance, and good developer experience

### Date/Time Handling
- **date-fns** - Date manipulation, formatting, and calendar calculations
- Lightweight, tree-shakeable, and modern

### HTTP Client & API
- **Native fetch API** - For API calls
- **API Routes** - Netlify Functions for backend API endpoints
  - Database operations
  - Email sending via AWS SES
  - Authentication helpers

### Database Access
- **Neon Serverless Driver** - Direct SQL queries using `@neondatabase/serverless`
- **PostgreSQL** - Database (via Neon)
- No ORM - Direct SQL for simplicity and control

### UI Components & Libraries
- **Shadcn UI** - Component library (built on Radix UI + Tailwind)
  - Components needed:
    - Dialog (for date entry modal)
    - Calendar (for calendar view)
    - Button
    - Input
    - Select (for work type dropdown)
    - Textarea (for comments)
    - Card (for entry cards)
    - Toast (for notifications)
    - Label
    - Form (React Hook Form integration)
- **Tailwind CSS** - Styling (already using)
- **HTML5 time input** - `<input type="time">` for time range inputs
- **Responsive design**: Mobile-first approach, works on both mobile and desktop

### Email & Background Jobs
- **Netlify Functions** - Serverless functions for:
  - API endpoints
  - Email sending via AWS SES
- **Netlify Scheduled Functions** - Cron jobs for automatic report submission on 2nd of each month
- **AWS SES** - Email service for sending reports to boss

### Code Quality & Tools
- **ESLint** - Linting with standard React/TypeScript config
- **Prettier** - Code formatting
- Standard configuration for both

### Language & Localization
- **Swedish** - All UI text in Swedish (hardcoded for now)
- **Future**: i18n support for English translation (not in Phase 1)

### Error Handling & User Feedback
- **Toast notifications** - For success/error messages (Shadcn Toast component)
- **Console logs** - For debugging and error tracking
- **Loading spinners** - Show during API calls and data fetching
- **Error states** - Display user-friendly error messages

### Accessibility
- **Shadcn defaults** - Shadcn UI components are built on Radix UI, which provides excellent accessibility out of the box
- Follows ARIA standards and keyboard navigation

### Environment Variables
- **Development**: `.env.local` file
- **Production**: Netlify environment variables
- Variables needed:
  - `VITE_CLERK_PUBLISHABLE_KEY` (public, frontend)
  - `CLERK_SECRET_KEY` (server-side only, Netlify Functions)
  - `DATABASE_URL` (Neon connection string, server-side only)
  - `AWS_SES_REGION`
  - `AWS_SES_ACCESS_KEY_ID`
  - `AWS_SES_SECRET_ACCESS_KEY`
  - `BOSS_EMAIL_ADDRESS` (environment variable, can be changed later)

### Project Structure (Updated)
```
timrapport/
├── public/
│   └── (static assets)
├── src/
│   ├── components/
│   │   ├── ui/              # Shadcn UI components
│   │   │   ├── button.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── calendar.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── card.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── label.tsx
│   │   │   └── form.tsx
│   │   ├── Calendar/
│   │   │   ├── Calendar.tsx
│   │   │   ├── CalendarDay.tsx
│   │   │   └── DateModal.tsx
│   │   ├── Auth/
│   │   │   └── (Clerk components)
│   │   └── Layout/
│   │       ├── Header.tsx
│   │       └── Footer.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Report.tsx
│   │   ├── Preview.tsx
│   │   └── Login.tsx
│   ├── services/
│   │   ├── api.ts           # API client (fetch)
│   │   └── database.ts      # Direct SQL queries
│   ├── contexts/
│   │   ├── AuthContext.tsx
│   │   ├── CalendarContext.tsx
│   │   └── ReportContext.tsx
│   ├── utils/
│   │   ├── dateHelpers.ts   # date-fns helpers
│   │   └── validation.ts
│   ├── hooks/
│   │   └── (custom hooks)
│   ├── styles/
│   │   └── globals.css
│   ├── App.tsx
│   └── main.tsx
├── netlify/
│   └── functions/           # Netlify Functions (API routes)
│       ├── submit-report.ts
│       ├── send-email.ts
│       └── auto-submit.ts   # Scheduled function
├── .env.local
├── package.json
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
└── netlify.toml
```

---

## Project Structure

### Recommended Folder Structure
```
timrapport/
├── public/
│   └── (static assets)
├── src/
│   ├── components/
│   │   ├── Calendar/
│   │   │   ├── Calendar.jsx
│   │   │   ├── CalendarDay.jsx
│   │   │   └── DateModal.jsx
│   │   ├── Auth/
│   │   │   └── (Clerk components)
│   │   └── Layout/
│   │       ├── Header.jsx
│   │       └── Footer.jsx
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── Report.jsx
│   │   └── Login.jsx
│   ├── services/
│   │   ├── api.js
│   │   └── database.js
│   ├── utils/
│   │   ├── dateHelpers.js
│   │   └── validation.js
│   ├── hooks/
│   │   └── (custom hooks)
│   ├── styles/
│   │   └── globals.css
│   ├── App.jsx
│   └── main.jsx
├── .env.local
├── package.json
├── tailwind.config.js
└── vite.config.js (or similar)
```

---

## User Workflow

### Initial Registration (One-time)
1. Worker goes to registration page
2. Worker enters required information:
   - Email
   - Name
   - Last name
   - Personnummer (full)
3. Account is created with Clerk
4. Profile information is saved to Neon database
5. Worker is ready to use the app

### Regular Usage Flow
1. Worker goes to login page
2. Worker enters **full personnummer** (last 4 digits masked as they type: `19900101****`)
3. System looks up user by full personnummer and authenticates via Clerk
4. Worker views calendar (current month)
5. Worker clicks on dates they worked
6. Worker adds entries (slots) for each date:
   - Time range: From (e.g., 08:00) to (e.g., 12:00)
   - Work type (Cafe, Coaching, Administration, Cleaning, or Annat)
   - If Annat selected: optional text field appears to specify
   - Optional comment
7. Worker can add multiple entries per date (displayed as cards)
8. Worker can edit/add/delete entries for current month (before submission)
9. Worker can view preview/förhandsvisning of the monthly report
10. At end of month or beginning of next month:
    - Worker can manually submit report (locks the month, sends email immediately)
    - OR report auto-submits and emails on 2nd of next month (if entries exist and not manually submitted)
11. After submission, past months become read-only
12. Worker logs out

---

## Features to Implement (Phase 1)

### Must Have
1. ✅ Clerk authentication:
   - Registration with required fields: Email, Name, Last name, Personnummer
   - Login with full personnummer (last 4 digits masked as they type)
   - Custom login flow that looks up user by personnummer
2. ✅ Calendar view with current and past months
3. ✅ Click date → popup modal showing:
   - Existing entries displayed as **cards** for that date
   - Each card shows: time range, work type, annat spec (if applicable), comment
   - Add new entry/slot with:
     - Time range: From time and To time inputs
     - Work type selection (Cafe, Coaching, Administration, Cleaning, Annat)
     - Annat specification field (only shown when Annat is selected)
     - Comment field (optional)
   - Edit/delete existing entries (if month not locked)
4. ✅ Multiple entries (slots) per date
5. ✅ Save hour entries to Neon database (each entry = separate row)
6. ✅ Preview/Förhandsvisning page before submission
7. ✅ Monthly report submission:
   - Manual "Submit Report" button (sends email immediately, stores in database)
   - Automatic submission on 2nd of next month (hardcoded, sends email if not manually submitted)
8. ✅ Lock past months after submission (read-only)
9. ✅ Validation: minimum one entry required before submission
10. ✅ White/Blue/Red/Black color scheme with Tailwind

### Future Features (Not Phase 1)
- Admin dashboard to view all reports
- Email reminder system (automated, 2nd of each month)
- Report approval workflow
- Export/print reports
- Configurable auto-submission date

---

## Technical Configuration

1. **Email Service**: AWS SES (Amazon Simple Email Service)
   - Used for sending reports to the boss
   - Used for sending reminder emails to workers (future feature)

2. **Boss Email Address**: 
   - Reports are sent to the boss's email address
   - Email address to be configured (environment variable or database setting)

3. **Password Requirements**: Clerk's default password requirements

---

## Next Steps - Implementation Plan

1. ✅ Planning complete - all clarifications received
2. ✅ Tech stack finalized

### Phase 1: Project Setup
3. Initialize React + TypeScript project with Vite
4. Install and configure dependencies:
   - React Router
   - Clerk (authentication)
   - Tailwind CSS
   - Shadcn UI (install and configure)
   - date-fns
   - React Hook Form
   - @neondatabase/serverless
   - ESLint + Prettier
5. Set up project structure (folders, files)
6. Configure Tailwind CSS with white/blue/red/black theme (mobile-first)
7. Install Shadcn UI components:
   - button, dialog, calendar, input, select, textarea, card, toast, label, form
8. Set up Swedish text constants/helpers (for future i18n)

### Phase 2: Authentication & Database
8. Set up Clerk authentication:
   - Registration form (email, name, last name, personnummer, password)
   - Custom login UI (full personnummer with masked last 4 digits → lookup → email → Clerk sign-in)
   - Clerk React components integration
9. Set up Neon database connection
10. Create database schema (SQL migrations):
    - Users table (name, last_name, personnummer, email, clerk_user_id)
    - Reports table (user_id, month, year, status, submitted_at)
    - Entries table (report_id, date, time_from, time_to, work_type, annat_spec, comment)
11. Create database service layer (direct SQL queries)

### Phase 3: Core Features
12. Build calendar component (Shadcn calendar) with month navigation (past and current months only)
13. Implement date click → modal (Shadcn dialog) with entry cards
14. Implement time range inputs (HTML5 time inputs, from/to in 24-hour format)
15. Implement add/edit/delete entries functionality (React Hook Form)
16. Set up React Context for state management (calendar, entries, reports)
17. Build preview/förhandsvisning page (month, dates, entries with time ranges, work types, totals)

### Phase 4: API & Email
18. Set up Netlify Functions structure
19. Create API routes (Netlify Functions):
    - Submit report endpoint
    - Get entries endpoint
    - Get reports endpoint
20. Set up AWS SES integration
21. Create email sending function (Netlify Function)
22. Implement report formatting for boss (worker info + date list with time ranges and totals)

### Phase 5: Submission & Automation
23. Implement report submission:
    - Manual: Submit button (calls API → sends email via AWS SES immediately, stores in database)
    - Automatic: Netlify Scheduled Function (runs on 2nd of each month, sends email if not manually submitted)
24. Add read-only restrictions for past months (after 2nd or after manual submission)
25. Add validation (minimum one entry, React Hook Form validation)

### Phase 6: Polish & Deploy
26. Style with Tailwind (white/blue/red/black theme, mobile-first responsive)
27. Add error handling:
    - Toast notifications for user feedback
    - Console logs for debugging
    - Error boundaries
28. Add loading states:
    - Spinners during API calls
    - Loading indicators for data fetching
29. Ensure all text is in Swedish
30. Test complete workflow (mobile and desktop)
31. Configure Netlify deployment
32. Set up environment variables in Netlify
33. Deploy to Netlify

---

## Planning Summary - Ready to Build! ✅

All planning is complete! Here's what we have:

### ✅ Core Requirements
- Monthly hour reporting system for tennis club workers
- Calendar-based entry system with time ranges (from X to X)
- Multiple entries per date
- Manual and automatic submission (2nd of next month)
- Email reports to boss via AWS SES
- Swedish language UI

### ✅ Tech Stack Finalized
- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS (mobile-first, white/blue/red/black theme)
- **UI Components**: Shadcn UI
- **Routing**: React Router
- **State**: React Context API
- **Forms**: React Hook Form
- **Dates**: date-fns
- **Backend**: Netlify Functions (API routes)
- **Database**: Neon PostgreSQL (direct SQL)
- **Auth**: Clerk (custom login with full personnummer, last 4 digits masked)
- **Email**: AWS SES via Netlify Functions
- **Scheduling**: Netlify Scheduled Functions
- **Deployment**: Netlify

### ✅ User Experience
- Mobile-first responsive design
- Toast notifications for feedback
- Loading spinners
- Swedish language throughout
- Accessible (Shadcn defaults)

### ✅ Ready to Start Implementation
All clarifications received, tech stack decided, and implementation plan outlined.
**Next step**: Begin Phase 1 - Project Setup

