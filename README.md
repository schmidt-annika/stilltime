# Stilltime

I built Stilltime for myself and my fellow students to keep track of the time we spend studying and working on other projects.

I wanted a simple way to record what I work on, see how I spend my days and look back at how much time different activities actually take. The result is a small time tracker with three main views: a timer, a calendar and analytics.

## Features

### Timer

The timer works like a regular stopwatch. You can start, pause, resume and finish a session. Once finished, you can assign labels and add a short note describing what you worked on.

Tapping the timer or the surrounding space enters focus mode, which hides the navigation and enlarges the centered clock. Tap again to return to the regular view.

Each session has exactly one **main label** and any number of **side labels**. Main labels represent broader categories, while side labels allow for more specific categorization.

For example, a session might have:

- **Main label:** Studium
- **Side labels:** Theoretical Computer Science, Exercise Sheet
- **Note:** Exercise Sheet 5

or 

- **Main label:** Studium
- **Side labels:** Theoretical Computer Science, Lecture
- **Note:** 17.11.2026

I chose this structure because I wanted to categorize time in different ways without having to maintain a complicated hierarchy of projects and subprojects.

### Calendar

The calendar displays sessions on a 24-hour timeline, positioned according to their saved start and end times and colored by their main labels.

This makes it possible to see not just how much time was spent working, but also *when* and *on what*. Sessions can be added manually or edited afterwards. Overlapping time blocks are not allowed (this is not Harry Potter PoA ;).

### Analytics

The analytics view aggregates recorded time over a selected period, such as a week or month.

You can filter by any combination of main and side labels. For example, you might want to see how much time you spent studying in total or specifically how much time went into exercise sheets for a particular course or just how much went into this course in general. Labels within a group are combined with AND and groups are combined with OR. For example, `(Theoretical Computer Science AND Lecture) OR (Theoretical Computer Science AND Exercise Sheet)` excludes sessions spent only reading the script. A session matching several groups is counted only once. 

## Technical details

Stilltime is a PWA written in vanilla HTML, CSS and JavaScript, without frameworks or a build process. I chose a PWA because I primarily wanted to use the app on my iPhone without having to develop a native iOS application.

### Time tracking

The timer uses timestamps rather than counting seconds through repeated callbacks.

When a session is running, the app stores the start timestamp of the current interval and the accumulated duration of previous intervals. The elapsed time is calculated using `Date.now()`.

This is particularly useful on iOS, where JavaScript execution may be suspended when the app is in the background or the screen is locked. Even if the display stops updating temporarily, the correct elapsed time can be calculated when the app becomes active again.

Pauses are excluded from the elapsed duration. To keep the calendar from becoming fragmented, a finished session is saved as one continuous block ending at the time it was finished. Its start is calculated by subtracting the active duration from the finish time, so pauses effectively shift the saved start forward. The calendar therefore does not reconstruct the actual individual working intervals and the proposed block may need manual adjustment if it overlaps another entry. The entry editor currently stores times at minute precision.

### Data storage and analytics

All sessions and labels are stored locally using the browser's `localStorage`. There is no backend, database server or user account.

Each session stores its start and end timestamps, a reference to its main label, additional labels and an optional note. Main labels are stored separately with their names and colors.

The calendar and analytics are generated from these entries. For the analytics, sessions are filtered by the selected labels and date range and their durations are aggregated by day and main label. Sessions crossing midnight are split across the relevant days for these calculations.

### Offline access and backups

A service worker caches the application's static files, allowing Stilltime to be used offline after the initial visit.

Since data is stored in `localStorage`, it is specific to the browser and website origin and is not synchronized between devices. Clearing browser data may delete the recorded sessions, so regular backups are recommended. The app therefore supports exporting and importing JSON backups. Importing a backup replaces the existing local data after confirmation.

## Using Stilltime

Stilltime is hosted on GitHub Pages and can be opened directly in a browser.

**[Open Stilltime](https://schmidt-annika.github.io/stilltime/)**

On an iPhone, open the website in Safari and select *Share → Add to Home Screen* to install it as a standalone web app.
