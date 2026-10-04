"""Storyboard for the Student / Final Year Project social ad.

Every feature named here exists in the shipped module:
  * free 30-minute consultation with live slot booking (PKT)  -> student-projects/consultation.html
  * full project-development request in 7 numbered fieldsets  -> student-projects/project-request.html
  * Google Meet confirmation, reference + lookup by email     -> consultation.html / project-request.html
  * admin flow: requirements review -> quote -> development -> delivery (api/student_projects.php)
  * references CONS-2026-xxxxx (consultation) and FYP-2026-xxxxx (project request)

Each scene owns a list of narration lines. A line is the unit of speech: it
is synthesised on its own so the burned-in caption, the karaoke sweep and the
animation all line up with the audio exactly.

Lines are deliberately short (3-6 words). Social viewers drop off fast, and
the measured speech budget has to leave room for the gaps, the beats between
scenes and the end-card hold.

  ur     = Urdu script, fed to the ur-PK neural voice (correct pronunciation)
  roman  = Roman Urdu, burned into the picture (what the audience reads)
"""

LINE_GAP = 0.16      # silence between two narration lines
SCENE_GAP = 0.34     # extra breath at a scene change
TAIL = 1.40# hold on the end card
LEAD_IN = 0.30       # beat before the first word

SCENES = [
    {
        "id": "hook",
        "kind": "hook",
        "lines": [
            {"roman": "Aap ka project abhi tak shuru nahi hua?",
             "ur": "آپ کا پروجیکٹ ابھی تک شروع نہیں ہوا؟"},
            {"roman": "Deadline qareeb hai, waqt nahi hai.",
             "ur": "ڈیڈ لائن قریب ہے، وقت نہیں ہے۔"},
        ],
    },
    {
        "id": "problem",
        "kind": "problem",
        "lines": [
            {"roman": "Topic badal gaya, reference nahi, report qareeb.",
             "ur": "ٹاپک بدل گیا، ریفرنس نہیں، رپورٹ قریب ہے۔"},
        ],
    },
    {
        "id": "brand",
        "kind": "brand",
        "lines": [
            {"roman": "Gopang IT Solution, students ke liye.",
             "ur": "گوپنگ آئی ٹی سولوشن، طلباء کے لیے۔"},
            {"roman": "100% free consultation, 30 minute.",
             "ur": "مکمل طور پر مفت کنسٹنٹیشن، تیس منٹ۔"},
        ],
    },
    {
        "id": "booking",
        "kind": "booking",
        "lines": [
            {"roman": "Apna time slot chunein, Pakistan Standard Time.",
             "ur": "اپنا ٹائم سلٹ چنیے، پاکستان اسٹینڈرڈ ٹائم۔"},
            {"roman": "Google Meet link fori mil jata hai.",
             "ur": "گوگل میٹ لنک فوراً مل جاتا ہے۔"},
            {"roman": "Koi shart nahi.",
             "ur": "کوئی شرط نہیں۔"},
        ],
    },
    {
        "id": "request",
        "kind": "request",
        "lines": [
            {"roman": "Ya 7 steps mein poora project request bhejein.",
             "ur": "یا سات مراحل میں پورا ریکویسٹ بھیجیں۔"},
        ],
    },
    {
        "id": "flow",
        "kind": "flow",
        "lines": [
            {"roman": "Review, scope aur quote ki tasdeeq.",
             "ur": "ریویو، اسکوپ اور کوٹ کی تصدیق۔"},
            {"roman": "Phir development aur delivery.",
             "ur": "پھر ڈیولپمنٹ اور ڈیلیوری۔"},
            {"roman": "Har request ka apna reference.",
             "ur": "ہر ریکویسٹ کا اپنا ریفرنس۔"},
        ],
    },
    {
        "id": "deliverables",
        "kind": "deliverables",
        "lines": [
            {"roman": "Source code, UI/UX, backend, deployment.",
             "ur": "سورس کوڈ، یو آئی یو ایکس، بیک اینڈ، ڈیپلوئمنٹ۔"},
            {"roman": "Web app, mobile app, AI, ERP.",
             "ur": "ویب ایپ، موبائل ایپ، اے آئی، ای آر پی۔"},
        ],
    },
    {
        "id": "cta",
        "kind": "cta",
        "lines": [
            {"roman": "Aaj hi free booking karein.",
             "ur": "آج ہی مفت بکنگ کریں۔"},
            {"roman": "Gopangitsolution.com, select Student Projects.",
             "ur": "گوپنگ آئی ٹی سولوشن ڈاٹ کام، سلیکٹ اسٹوڈنٹ پروجیکٹس۔"},
        ],
    },
]

VOICE = "ur-PK-AsadNeural"   # male, friendly/positive — Pakistani Urdu
VOICE_RATE = "+28%"
VOICE_PITCH = "-2Hz"