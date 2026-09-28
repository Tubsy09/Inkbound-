"""Seed data for InkBound tattoo parlour app."""
from datetime import datetime, timezone

STYLES = [
    "All",
    "Traditional",
    "Realism",
    "Blackwork",
    "Fine Line",
    "Japanese",
    "Neo-Traditional",
    "Watercolor",
    "Geometric",
]

# High quality tattoo / studio imagery
IMG = {
    "studio1": "https://images.unsplash.com/photo-1760877611905-0f885a3ce551?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
    "studio2": "https://images.unsplash.com/photo-1775135981378-4e7c1767436d?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
    "artist_close": "https://images.unsplash.com/photo-1568515045052-f9a854d70bfd?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
    "tattoo1": "https://images.unsplash.com/photo-1597852075234-fd721ac361d3?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
    "tattoo2": "https://images.unsplash.com/photo-1611501275019-9b5cda994e8d?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
    "tattoo3": "https://images.unsplash.com/photo-1590246814883-57c511e76523?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
    "tattoo4": "https://images.unsplash.com/photo-1562962230-16e4623d36e6?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
    "tattoo5": "https://images.unsplash.com/photo-1611501275019-9b5cda994e8d?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
    "tattoo6": "https://images.unsplash.com/photo-1607031785502-f36a1e8f3b3e?crop=entropy&cs=srgb&fm=jpg&q=85&w=800",
    "portrait_m": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
    "portrait_f": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
    "portrait_m2": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
    "portrait_f2": "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
}

PORTFOLIO = [IMG["tattoo1"], IMG["tattoo2"], IMG["tattoo3"], IMG["tattoo4"], IMG["tattoo5"], IMG["tattoo6"]]


def build_seed():
    now = datetime.now(timezone.utc).isoformat()

    parlours = [
        {
            "id": "pl_1", "name": "Iron & Ink Collective",
            "tagline": "Fine line & blackwork specialists in the Arts District.",
            "address": "812 E 3rd St, Los Angeles, CA",
            "latitude": 34.0448, "longitude": -118.2352,
            "cover": IMG["studio1"], "gallery": [IMG["studio1"], IMG["tattoo1"], IMG["tattoo3"]],
            "styles": ["Fine Line", "Blackwork", "Geometric"],
            "rating": 4.9, "review_count": 128, "price_level": "$$$",
            "hours": "Tue–Sun · 11am–8pm", "deleted_at": None, "created_at": now,
        },
        {
            "id": "pl_2", "name": "Crimson Crane Studio",
            "tagline": "Traditional Japanese irezumi & neo-traditional.",
            "address": "1440 Sunset Blvd, Los Angeles, CA",
            "latitude": 34.0785, "longitude": -118.2606,
            "cover": IMG["studio2"], "gallery": [IMG["studio2"], IMG["tattoo2"], IMG["tattoo4"]],
            "styles": ["Japanese", "Neo-Traditional", "Traditional"],
            "rating": 4.8, "review_count": 96, "price_level": "$$$$",
            "hours": "Mon–Sat · 12pm–9pm", "deleted_at": None, "created_at": now,
        },
        {
            "id": "pl_3", "name": "Golden Hour Tattoo",
            "tagline": "Watercolor, realism and custom color work.",
            "address": "225 Abbot Kinney Blvd, Venice, CA",
            "latitude": 33.9905, "longitude": -118.4655,
            "cover": IMG["tattoo3"], "gallery": [IMG["tattoo3"], IMG["tattoo5"], IMG["studio1"]],
            "styles": ["Watercolor", "Realism", "Fine Line"],
            "rating": 4.7, "review_count": 74, "price_level": "$$",
            "hours": "Wed–Sun · 10am–7pm", "deleted_at": None, "created_at": now,
        },
        {
            "id": "pl_4", "name": "Black Lotus Parlour",
            "tagline": "Bold blackwork, dotwork and sacred geometry.",
            "address": "5901 Hollywood Blvd, Los Angeles, CA",
            "latitude": 34.1016, "longitude": -118.3200,
            "cover": IMG["tattoo4"], "gallery": [IMG["tattoo4"], IMG["tattoo6"], IMG["artist_close"]],
            "styles": ["Blackwork", "Geometric", "Realism"],
            "rating": 4.9, "review_count": 152, "price_level": "$$$",
            "hours": "Daily · 11am–9pm", "deleted_at": None, "created_at": now,
        },
        {
            "id": "pl_5", "name": "Old Salt Tattoo Co.",
            "tagline": "American traditional done the classic way.",
            "address": "78 Windward Ave, Venice, CA",
            "latitude": 33.9877, "longitude": -118.4720,
            "cover": IMG["tattoo5"], "gallery": [IMG["tattoo5"], IMG["tattoo1"], IMG["studio2"]],
            "styles": ["Traditional", "Neo-Traditional"],
            "rating": 4.6, "review_count": 61, "price_level": "$$",
            "hours": "Tue–Sun · 12pm–8pm", "deleted_at": None, "created_at": now,
        },
        {
            "id": "pl_6", "name": "Silver Needle Atelier",
            "tagline": "Hyper-realism portraits & micro fine line.",
            "address": "333 S Spring St, Los Angeles, CA",
            "latitude": 34.0505, "longitude": -118.2489,
            "cover": IMG["artist_close"], "gallery": [IMG["artist_close"], IMG["tattoo2"], IMG["tattoo6"]],
            "styles": ["Realism", "Fine Line", "Geometric"],
            "rating": 5.0, "review_count": 43, "price_level": "$$$$",
            "hours": "By appointment · Mon–Fri", "deleted_at": None, "created_at": now,
        },
    ]

    artists = [
        {"id": "ar_1", "parlour_id": "pl_1", "name": "Mara Voss", "avatar": IMG["portrait_f"],
         "specialty": "Fine Line & Blackwork", "bio": "12 years turning delicate linework into lasting art. Known for botanical and geometric fine line.",
         "styles": ["Fine Line", "Blackwork"], "rating": 4.9, "years": 12, "portfolio": PORTFOLIO},
        {"id": "ar_2", "parlour_id": "pl_1", "name": "Dane Okafor", "avatar": IMG["portrait_m"],
         "specialty": "Geometric & Dotwork", "bio": "Sacred geometry and precise dotwork mandalas.",
         "styles": ["Geometric", "Blackwork"], "rating": 4.8, "years": 8, "portfolio": PORTFOLIO[::-1]},
        {"id": "ar_3", "parlour_id": "pl_2", "name": "Yuki Tanaka", "avatar": IMG["portrait_f2"],
         "specialty": "Japanese Irezumi", "bio": "Traditional Japanese full-sleeve and back-piece specialist.",
         "styles": ["Japanese", "Traditional"], "rating": 4.9, "years": 15, "portfolio": PORTFOLIO},
        {"id": "ar_4", "parlour_id": "pl_3", "name": "Sofia Reyes", "avatar": IMG["portrait_f"],
         "specialty": "Watercolor & Color Realism", "bio": "Vivid watercolor washes and painterly color realism.",
         "styles": ["Watercolor", "Realism"], "rating": 4.7, "years": 6, "portfolio": PORTFOLIO[2:] + PORTFOLIO[:2]},
        {"id": "ar_5", "parlour_id": "pl_4", "name": "Kai Mercer", "avatar": IMG["portrait_m2"],
         "specialty": "Blackwork & Geometry", "bio": "Heavy black, negative space and bold sacred geometry.",
         "styles": ["Blackwork", "Geometric"], "rating": 4.9, "years": 10, "portfolio": PORTFOLIO},
        {"id": "ar_6", "parlour_id": "pl_5", "name": "Jesse Cole", "avatar": IMG["portrait_m"],
         "specialty": "American Traditional", "bio": "Bold lines, bright colors, timeless classic flash.",
         "styles": ["Traditional", "Neo-Traditional"], "rating": 4.6, "years": 9, "portfolio": PORTFOLIO[::-1]},
        {"id": "ar_7", "parlour_id": "pl_6", "name": "Elena Novak", "avatar": IMG["portrait_f2"],
         "specialty": "Hyper Realism", "bio": "Photorealistic portraits and micro fine line work.",
         "styles": ["Realism", "Fine Line"], "rating": 5.0, "years": 14, "portfolio": PORTFOLIO},
    ]

    service_defs = [
        ("Small Fine Line", "Fine Line", 120, 60),
        ("Medium Custom Piece", "Blackwork", 350, 180),
        ("Full Sleeve Session", "Japanese", 600, 360),
        ("Geometric Design", "Geometric", 280, 150),
        ("Watercolor Piece", "Watercolor", 400, 210),
        ("Realism Portrait", "Realism", 550, 300),
        ("Traditional Flash", "Traditional", 180, 90),
        ("Consultation", "All", 0, 30),
    ]
    services = []
    for p in parlours:
        for i, (nm, style, price, mins) in enumerate(service_defs):
            services.append({
                "id": f"sv_{p['id']}_{i}", "parlour_id": p["id"], "name": nm,
                "style": style, "price": price, "duration_min": mins,
            })

    reviews = [
        {"id": "rv_1", "parlour_id": "pl_1", "user_id": "seed", "user_name": "Priya S.", "rating": 5,
         "comment": "Mara's linework is unreal. Clean shop, painless session.", "created_at": now},
        {"id": "rv_2", "parlour_id": "pl_1", "user_id": "seed", "user_name": "Marcus T.", "rating": 5,
         "comment": "Best geometric piece I've ever gotten. Highly recommend.", "created_at": now},
        {"id": "rv_3", "parlour_id": "pl_2", "user_id": "seed", "user_name": "Aiko N.", "rating": 5,
         "comment": "Yuki's irezumi work is museum-quality. Worth every penny.", "created_at": now},
        {"id": "rv_4", "parlour_id": "pl_4", "user_id": "seed", "user_name": "Devon L.", "rating": 5,
         "comment": "Kai nailed my blackwork sleeve. Incredible atmosphere.", "created_at": now},
        {"id": "rv_5", "parlour_id": "pl_3", "user_id": "seed", "user_name": "Hana K.", "rating": 4,
         "comment": "Loved the watercolor. Bright and healed beautifully.", "created_at": now},
    ]

    return {"parlours": parlours, "artists": artists, "services": services, "reviews": reviews}


# Base service templates keyed by style, used for seeded + newly onboarded studios.
SERVICE_TEMPLATES = [
    ("Small Fine Line", "Fine Line", 120, 60),
    ("Medium Custom Piece", "Blackwork", 350, 180),
    ("Full Sleeve Session", "Japanese", 600, 360),
    ("Geometric Design", "Geometric", 280, 150),
    ("Watercolor Piece", "Watercolor", 400, 210),
    ("Realism Portrait", "Realism", 550, 300),
    ("Traditional Flash", "Traditional", 180, 90),
    ("Neo-Traditional Piece", "Neo-Traditional", 320, 160),
]


def service_defs_for_styles(parlour_id: str, styles):
    """Build a service menu for a studio: matching-style services + a consultation."""
    chosen = [t for t in SERVICE_TEMPLATES if t[1] in styles]
    if not chosen:
        chosen = SERVICE_TEMPLATES[:2]
    services = []
    for i, (nm, style, price, mins) in enumerate(chosen):
        services.append({
            "id": f"sv_{parlour_id}_{i}", "parlour_id": parlour_id, "name": nm,
            "style": style, "price": price, "duration_min": mins,
        })
    services.append({
        "id": f"sv_{parlour_id}_c", "parlour_id": parlour_id, "name": "Consultation",
        "style": "All", "price": 0, "duration_min": 30,
    })
    return services
