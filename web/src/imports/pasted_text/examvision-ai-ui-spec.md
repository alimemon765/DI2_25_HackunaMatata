give text for copy paste

Create a high-fidelity, responsive web application UI for an Offline Examination Video Analytics & Investigation System called ExamVision AI.

The system is designed for examination authorities to analyze previously recorded CCTV footage after examinations. It uses motion estimation to detect activity, identify Regions of Interest (ROI), detect potentially prohibited objects such as mobile phones and paper/chits where feasible, automatically segment videos into meaningful events, generate motion heatmaps and activity timelines, and help investigators quickly review suspicious or relevant footage.

Design Style
Professional AI investigation / security analytics dashboard
Dark navy/charcoal theme
Clean, modern, premium enterprise UI
Blue/cyan accents for AI analytics
Amber for warnings and red for high-priority events
Green for normal/verified events
Minimal gradients and no gaming-style visuals
Use Inter/Geist-style typography
Desktop-first design at 1440×900
Use clean cards, subtle borders, compact data visualizations, and Lucide-style icons
Main Navigation

Create a left sidebar with:

Dashboard
Video Analysis
Event Explorer
ROI Analysis
Activity Timeline
Object Detection
Reports
Archive
System Status
Settings

At the bottom show:

GPU Usage
Storage Usage
Processing Queue

Example:
GPU 78% | Storage 4.8 TB / 12 TB | 2 Videos Processing

1. Dashboard

Title: Investigation Dashboard

Subtitle:
"Review and prioritize activity detected across recorded examination footage."

Add buttons:

New Analysis
Date Range
Examination Session

KPI cards:

Videos Analyzed
24

Total Footage
186h 42m

Events Detected
342

High Priority Events
18

ROI Detections
1,284

Processing Status
92% Complete

Add a large Activity Overview graph showing activity score over time.

Filters:

All Cameras
Camera 01
Camera 02
Camera 03
Camera 04

Add sections:

Recent High-Priority Events
Processing Queue
Camera Activity
Recent Investigations
2. Video Analysis

Title: Video Analysis

Create a large drag-and-drop upload area.

Text:

Upload Recorded Examination Footage

"Drag and drop CCTV recordings here or browse files."

Supported formats:
MP4, AVI, MOV, MKV

Options:

Run Object Detection
Generate Motion Heatmap
Automatically Segment Events

Show processing pipeline:

Video Ingestion → Frame Extraction → Motion Estimation → ROI Detection → Object Detection → Event Segmentation → Analytics Generation

Show:
Processing Mode: OFFLINE

3. Video Investigation Workspace

This should be the most important and visually impressive screen.

Create a large CCTV video player showing an examination hall.

Overlay information:

CAM-03
14:32:18
Activity Score: 82%
ROI: 04

Add bounding boxes around active regions.

ROI labels:

ROI 01 — Student Area
ROI 02 — Desk Area
ROI 03 — Possible Object
ROI 04 — Hand Movement

On the right side create an Detected Events panel.

Example event:

14:32:18 — Elevated Activity

ROI 03
Activity Score: 86%
Confidence: 91%
Duration: 8 sec

Buttons:

Review
Mark Relevant
Ignore

Other event types:

Possible Mobile Phone
Possible Paper/Chit
Multiple ROI Movement
Unusual Activity
4. Motion Heatmap

Add a Motion Heatmap section below the video.

Show the examination hall frame with a heatmap overlay.

Legend:

Low Activity
Medium Activity
High Activity

Controls:

Heatmap Opacity
Time Window
Motion Threshold

Description:

"Heatmap represents accumulated motion intensity across the selected time interval."

5. Activity Timeline

Create a wide timeline below the video.

Show:

00:00 ───── 01:00 ───── 02:00 ───── 03:00

Use different activity intensity levels.

Add clickable event markers:

14:21:08 — Elevated Activity
14:32:18 — Possible Object
14:41:52 — Multiple ROI Movement

Controls:

Play/Pause
Previous Event
Next Event
Playback Speed
Timeline Zoom
Bookmark

Clicking an event should jump the video to that timestamp.

6. Event Explorer

Title: Event Explorer

Add search:

"Search timestamp, camera, event, ROI or object..."

Filters:

Date/Time
Camera
Event Type
Severity
Confidence
ROI
Object Type

Create a table:

Timestamp | Camera | Event | ROI | Activity | Confidence | Status | Action

Example:

14:32:18 | CAM-03 | Elevated Motion | ROI-03 | 86% | 91% | Unreviewed | Review

14:41:52 | CAM-02 | Possible Object | ROI-07 | 74% | 87% | Unreviewed | Review

15:02:11 | CAM-04 | Multiple Movement | ROI-02 | 68% | 82% | Reviewed | View

Status badges:

Unreviewed
Reviewed
Relevant
Ignored
7. ROI Analysis

Title: ROI Analysis

Display a large examination hall frame with numbered bounding boxes.

Example:

ROI 01
Activity: 72%
Duration: 18 sec

ROI 02
Activity: 91%
Duration: 11 sec

ROI 03
Activity: 43%
Duration: 6 sec

Right-side panel:

ROI Details

ROI ID: ROI-03
Activity Score: 91%
Motion Duration: 11.4 sec
Confidence: 94%
Detected Objects: Possible Mobile Phone
Event Count: 4

Buttons:

View Events
Compare Timeline
Mark Relevant
Edit ROI
Reset ROI
Save Annotation
8. Object Detection

Title: Object Detection

Purpose:
"Identify external or potentially prohibited objects where technically feasible."

Object categories:

Mobile Phone
Paper / Chit
Book / Unauthorized Material
Other Object

Create detection cards with:

Possible Mobile Phone

Camera: CAM-03
Timestamp: 14:32:18
Confidence: 89%
ROI: ROI-03
Status: Needs Review

Show a cropped CCTV frame containing the detected object.

Add important disclaimer:

AI detection is an investigation aid. Final verification must be performed by an authorized human reviewer.

9. Event Detail

Title:

Event #EVT-00342

Status: High Priority

Show:

Large event snapshot
ROI bounding box
Timestamp
Camera ID
Activity score
Confidence score

Information:

Camera: CAM-03
Timestamp: 14:32:18
Duration: 8.4 sec
Activity Score: 86%
Confidence: 91%
ROI: ROI-03
Detected Object: Possible Mobile Phone

Add segmented video clip:

14:32:14 → 14:32:23

Buttons:

Play
Pause
Previous Frame
Next Frame
Export Clip

Investigator actions:

Mark Relevant
Mark False Positive
Add Note
Bookmark
Export Clip

Add notes field:

"Add investigation notes..."

10. Segmented Events

Title: Segmented Events

Create video event cards.

Each card should contain:

Event #EVT-00342
14:32:14 — 14:32:23
Duration: 9 sec
Camera: CAM-03
Activity: High
Confidence: 91%

Tags:
Motion
ROI-03
Possible Object

Buttons:

Review Clip
Export Clip

Filters:

All
High Priority
Object Detection
High Motion
Unreviewed
11. Reports

Title: Investigation Report

Show:

Examination: Semester Examination — IT Department
Date: 22 Aug 2026
Cameras: 12
Total Footage: 186h 42m
Events Detected: 342
High Priority: 18
Reviewed: 127
Potential Object Detections: 23

Add charts:

Activity Distribution
Events by Camera
Events by Category
High-Priority Events Timeline

Buttons:

Generate PDF Report
Export Event Log
Export Selected Clips
12. System Status

Title: System Status

Cards:

GPU Utilization: 78%
CPU Usage: 42%
RAM: 64 / 128 GB
Storage: 4.8 / 12 TB
Processing Queue: 2 Videos
Average Processing Speed: 2.4× Realtime

Also show:

Active Jobs
Completed Jobs
Failed Jobs
Storage Health
Last Backup
Processing Logs
13. Global Search

Create a global search interface.

Placeholder:

"Search timestamp, camera, event, ROI or object..."

Example searches:

CAM-03
Possible Mobile Phone
14:32
ROI-03
High Activity

Search results should show:

Timestamp
Camera
Event Type
Thumbnail
Confidence
Jump to Event
14. Important UX Requirements

The UI must strongly communicate these capabilities:

Offline video processing
Motion estimation
Motion-based ROI detection
Prohibited object detection where feasible
Automatic event segmentation
Motion heatmaps
Activity timelines
Searchable event logs
Confidence scores
Human-in-the-loop verification
Exportable investigation reports
Large-scale video processing

Every AI result must display a confidence score.

Do not present AI detection as absolute proof.

Use terminology such as:

"Possible Mobile Phone"
"Potentially Relevant Activity"
"AI Confidence: 89%"
"Requires Human Verification"

15. Prototype Flow

Create connected prototype screens:

Dashboard → Video Analysis → Processing → Investigation Workspace → Event Detail → Event Explorer → ROI Analysis → Object Detection → Reports

The Video Investigation Workspace should be the centerpiece of the design.

The overall product should look like a real deployable AI-powered examination surveillance investigation platform, not a generic analytics dashboard.

Use realistic sample data and polished interactions throughout the prototype.