# aichat
# School avatar request email notifications

The backend stores every school avatar request before attempting email delivery. Configure these Railway environment variables to notify the ChopReality team after a successful submission:

```text
RESEND_API_KEY=re_...
SCHOOL_AVATAR_REQUEST_NOTIFY_EMAIL=info@chopreality.com
SCHOOL_AVATAR_REQUEST_FROM_EMAIL=ChopReality <noreply@chopreality.com>
```

`SCHOOL_AVATAR_REQUEST_NOTIFY_EMAIL` accepts comma-separated recipients and has no default: notifications stay disabled until an explicit destination is configured. The sender domain must be verified in Resend. Notifications contain only the request reference code; school, teacher, role, and teaching-material data remain in the private database. Email delivery failures are recorded in `school_avatar_requests.notification_status` and never discard an otherwise valid submission.
