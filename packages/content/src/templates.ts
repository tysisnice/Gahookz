// The shared prompt catalogue.
//
// One source for both the browser's suggestions and the server's fill. They
// used to be separate copied arrays, which is how the two drifted: the server
// picked content by mode while the client ignored the host's chosen style.
//
// Educational templates carry a verified answer and an explanation. Funny
// templates deliberately carry neither -- they are opinion prompts, and giving
// one a "correct" answer is exactly the bug where a funny question acquired a
// randomly chosen key. A Classic author must choose an intended answer for a
// funny prompt; nothing here will choose one for them.
//
// Option ids are stable so an instance can shuffle what the room sees while
// still recording which option was which.

export interface TemplateOption {
  readonly id: string;
  readonly text: string;
}

export interface EducationalTemplate {
  readonly id: string;
  readonly kind: "educational";
  readonly version: number;
  readonly question: string;
  readonly options: readonly TemplateOption[];
  /** Server-only until the reveal. Never present in an answering payload. */
  readonly factualAnswerId: string;
  readonly explanation: string;
}

export interface FunnyTemplate {
  readonly id: string;
  readonly kind: "funny";
  readonly version: number;
  /** Contains the {Player1} placeholder. */
  readonly question: string;
  readonly options: readonly TemplateOption[];
}

export type PromptTemplate = EducationalTemplate | FunnyTemplate;

export const PLAYER_PLACEHOLDER = "{Player1}";

/** Shown when a room has nobody eligible to name. */
export const ABSENT_PLAYER_NAME = "your imaginary teammate";

export const EDUCATIONAL_TEMPLATES: readonly EducationalTemplate[] = [
  {
    id: "EDU-NEW-01",
    kind: "educational",
    version: 1,
    question: "What is 7 × 9?",
    options: [
      { id: "o1", text: "63" },
      { id: "o2", text: "56" },
      { id: "o3", text: "72" },
      { id: "o4", text: "81" }
    ],
    factualAnswerId: "o1",
    explanation: "Seven groups of nine total 63."
  },
  {
    id: "EDU-NEW-02",
    kind: "educational",
    version: 1,
    question: "What is 3/5 written as a decimal?",
    options: [
      { id: "o1", text: "0.6" },
      { id: "o2", text: "0.3" },
      { id: "o3", text: "0.5" },
      { id: "o4", text: "0.8" }
    ],
    factualAnswerId: "o1",
    explanation: "Three divided by five is 0.6."
  },
  {
    id: "EDU-NEW-03",
    kind: "educational",
    version: 1,
    question: "How many degrees are in a right angle?",
    options: [
      { id: "o1", text: "90°" },
      { id: "o2", text: "45°" },
      { id: "o3", text: "180°" },
      { id: "o4", text: "360°" }
    ],
    factualAnswerId: "o1",
    explanation: "A right angle is one quarter of a full turn."
  },
  {
    id: "EDU-NEW-04",
    kind: "educational",
    version: 1,
    question: "What is the area of a rectangle 8 cm long and 3 cm wide?",
    options: [
      { id: "o1", text: "24 cm²" },
      { id: "o2", text: "11 cm²" },
      { id: "o3", text: "22 cm²" },
      { id: "o4", text: "48 cm²" }
    ],
    factualAnswerId: "o1",
    explanation: "Rectangle area is length multiplied by width: 8 × 3 = 24."
  },
  {
    id: "EDU-NEW-05",
    kind: "educational",
    version: 1,
    question: "What is the median of 2, 5 and 9?",
    options: [
      { id: "o1", text: "5" },
      { id: "o2", text: "2" },
      { id: "o3", text: "9" },
      { id: "o4", text: "16" }
    ],
    factualAnswerId: "o1",
    explanation: "The median is the middle value when the numbers are ordered."
  },
  {
    id: "EDU-NEW-06",
    kind: "educational",
    version: 1,
    question: "How many millilitres are in one litre?",
    options: [
      { id: "o1", text: "1,000" },
      { id: "o2", text: "10" },
      { id: "o3", text: "100" },
      { id: "o4", text: "10,000" }
    ],
    factualAnswerId: "o1",
    explanation: "A millilitre is one thousandth of a litre."
  },
  {
    id: "EDU-NEW-07",
    kind: "educational",
    version: 1,
    question: "What is the chemical symbol for oxygen?",
    options: [
      { id: "o1", text: "O" },
      { id: "o2", text: "Ox" },
      { id: "o3", text: "Og" },
      { id: "o4", text: "Om" }
    ],
    factualAnswerId: "o1",
    explanation: "Oxygen's symbol is O; Og is the symbol for a different element."
  },
  {
    id: "EDU-NEW-08",
    kind: "educational",
    version: 1,
    question: "What is the change from liquid water to solid ice called?",
    options: [
      { id: "o1", text: "Freezing" },
      { id: "o2", text: "Melting" },
      { id: "o3", text: "Evaporation" },
      { id: "o4", text: "Sublimation" }
    ],
    factualAnswerId: "o1",
    explanation: "Freezing changes a liquid into a solid."
  },
  {
    id: "EDU-NEW-09",
    kind: "educational",
    version: 1,
    question: "Which material is strongly attracted to an ordinary magnet?",
    options: [
      { id: "o1", text: "Iron" },
      { id: "o2", text: "Wood" },
      { id: "o3", text: "Glass" },
      { id: "o4", text: "Plastic" }
    ],
    factualAnswerId: "o1",
    explanation: "Iron is a ferromagnetic material."
  },
  {
    id: "EDU-NEW-10",
    kind: "educational",
    version: 1,
    question: "What is Earth's natural satellite called?",
    options: [
      { id: "o1", text: "The Moon" },
      { id: "o2", text: "Mars" },
      { id: "o3", text: "The Sun" },
      { id: "o4", text: "Venus" }
    ],
    factualAnswerId: "o1",
    explanation: "The Moon naturally orbits Earth."
  },
  {
    id: "EDU-NEW-11",
    kind: "educational",
    version: 1,
    question: "What makes the Moon look bright in the night sky?",
    options: [
      { id: "o1", text: "Reflected sunlight" },
      { id: "o2", text: "Heat from its surface" },
      { id: "o3", text: "Earth's shadow" },
      { id: "o4", text: "Light from its own flames" }
    ],
    factualAnswerId: "o1",
    explanation: "We see sunlight reflected from the Moon's surface."
  },
  {
    id: "EDU-NEW-12",
    kind: "educational",
    version: 1,
    question: "How many legs does a typical adult insect have?",
    options: [
      { id: "o1", text: "Six" },
      { id: "o2", text: "Four" },
      { id: "o3", text: "Eight" },
      { id: "o4", text: "Ten" }
    ],
    factualAnswerId: "o1",
    explanation: "Insects have three pairs of legs."
  },
  {
    id: "EDU-NEW-13",
    kind: "educational",
    version: 1,
    question: "What is a caterpillar's transformation into a butterfly called?",
    options: [
      { id: "o1", text: "Metamorphosis" },
      { id: "o2", text: "Photosynthesis" },
      { id: "o3", text: "Pollination" },
      { id: "o4", text: "Hibernation" }
    ],
    factualAnswerId: "o1",
    explanation: "Metamorphosis is a major change in body form during development."
  },
  {
    id: "EDU-NEW-14",
    kind: "educational",
    version: 1,
    question: "Which part of a typical land plant absorbs water and minerals from soil?",
    options: [
      { id: "o1", text: "Roots" },
      { id: "o2", text: "Flowers" },
      { id: "o3", text: "Fruits" },
      { id: "o4", text: "Petals" }
    ],
    factualAnswerId: "o1",
    explanation: "Roots take up water and dissolved minerals from the soil."
  },
  {
    id: "EDU-NEW-15",
    kind: "educational",
    version: 1,
    question: "What do we call two straight lines that meet at a right angle?",
    options: [
      { id: "o1", text: "Perpendicular" },
      { id: "o2", text: "Parallel" },
      { id: "o3", text: "Coincident" },
      { id: "o4", text: "Curved" }
    ],
    factualAnswerId: "o1",
    explanation: "Perpendicular lines meet at 90 degrees."
  },
  {
    id: "EDU-NEW-16",
    kind: "educational",
    version: 1,
    question: "What is the simple past tense of “go”?",
    options: [
      { id: "o1", text: "Went" },
      { id: "o2", text: "Goed" },
      { id: "o3", text: "Gone" },
      { id: "o4", text: "Going" }
    ],
    factualAnswerId: "o1",
    explanation: "“Go” is irregular: its simple past form is “went”."
  },
  {
    id: "EDU-NEW-17",
    kind: "educational",
    version: 1,
    question: "Which word is the adjective in “The sleepy cat yawned”?",
    options: [
      { id: "o1", text: "Sleepy" },
      { id: "o2", text: "The" },
      { id: "o3", text: "Cat" },
      { id: "o4", text: "Yawned" }
    ],
    factualAnswerId: "o1",
    explanation: "“Sleepy” describes the cat."
  },
  {
    id: "EDU-NEW-18",
    kind: "educational",
    version: 1,
    question: "What type of comparison is “as quiet as a mouse”?",
    options: [
      { id: "o1", text: "Simile" },
      { id: "o2", text: "Metaphor" },
      { id: "o3", text: "Personification" },
      { id: "o4", text: "Onomatopoeia" }
    ],
    factualAnswerId: "o1",
    explanation: "A simile makes a comparison using words such as “like” or “as”."
  },
  {
    id: "EDU-NEW-19",
    kind: "educational",
    version: 1,
    question: "What does a map's key or legend explain?",
    options: [
      { id: "o1", text: "The meaning of its symbols" },
      { id: "o2", text: "Only the direction north" },
      { id: "o3", text: "Only distances between places" },
      { id: "o4", text: "The map reader's speed" }
    ],
    factualAnswerId: "o1",
    explanation: "A legend explains the symbols and colours used on a map."
  },
  {
    id: "EDU-NEW-20",
    kind: "educational",
    version: 1,
    question: "Which compass direction is halfway between north and east?",
    options: [
      { id: "o1", text: "Northeast" },
      { id: "o2", text: "Northwest" },
      { id: "o3", text: "Southeast" },
      { id: "o4", text: "Southwest" }
    ],
    factualAnswerId: "o1",
    explanation: "Northeast is halfway between north and east on a compass."
  }
];

export const FUNNY_TEMPLATES: readonly FunnyTemplate[] = [
  {
    id: "FUN-NEW-01",
    kind: "funny",
    version: 1,
    question: "What is something that {Player1} just cannot live without?",
    options: [
      { id: "o1", text: "A suspiciously large snack stash" },
      { id: "o2", text: "Wi-Fi with full bars" },
      { id: "o3", text: "One more Gahook" },
      { id: "o4", text: "The snooze button" }
    ]
  },
  {
    id: "FUN-NEW-02",
    kind: "funny",
    version: 1,
    question: "If {Player1} had a completely useless superpower, what would it be?",
    options: [
      { id: "o1", text: "Finding the warm side of the pillow" },
      { id: "o2", text: "Summoning one uncooked noodle" },
      { id: "o3", text: "Knowing when a toaster is judging them" },
      { id: "o4", text: "Turning invisible only when nobody is looking" }
    ]
  },
  {
    id: "FUN-NEW-03",
    kind: "funny",
    version: 1,
    question: "What would {Player1} bring to a picnic on the Moon?",
    options: [
      { id: "o1", text: "An inflatable sofa" },
      { id: "o2", text: "Emergency cheese" },
      { id: "o3", text: "A speaker with one song" },
      { id: "o4", text: "A very confused duck" }
    ]
  },
  {
    id: "FUN-NEW-04",
    kind: "funny",
    version: 1,
    question: "If {Player1} opened a museum, what would its star exhibit be?",
    options: [
      { id: "o1", text: "A legendary unmatched sock" },
      { id: "o2", text: "A phone on 1% battery" },
      { id: "o3", text: "The world's most dramatic spoon" },
      { id: "o4", text: "A button labelled “Definitely don't press”" }
    ]
  },
  {
    id: "FUN-NEW-05",
    kind: "funny",
    version: 1,
    question: "What would be the title of {Player1}'s autobiography?",
    options: [
      { id: "o1", text: "I Was About to Do That" },
      { id: "o2", text: "Just Five More Minutes" },
      { id: "o3", text: "Snacks Were Involved" },
      { id: "o4", text: "I Pressed the Gahook Button" }
    ]
  },
  {
    id: "FUN-NEW-06",
    kind: "funny",
    version: 1,
    question: "What would {Player1} name a pet dragon?",
    options: [
      { id: "o1", text: "Toast" },
      { id: "o2", text: "Sir Nibbles" },
      { id: "o3", text: "Wi-Fi Password" },
      { id: "o4", text: "Kevin the Slightly Warm" }
    ]
  },
  {
    id: "FUN-NEW-07",
    kind: "funny",
    version: 1,
    question: "If {Player1} became mayor for a day, what would be their first rule?",
    options: [
      { id: "o1", text: "Mandatory afternoon snacks" },
      { id: "o2", text: "Slides instead of stairs" },
      { id: "o3", text: "Every meeting needs a theme song" },
      { id: "o4", text: "Friday begins on Tuesday" }
    ]
  },
  {
    id: "FUN-NEW-08",
    kind: "funny",
    version: 1,
    question: "What would {Player1}'s entrance music sound like?",
    options: [
      { id: "o1", text: "A heroic kazoo solo" },
      { id: "o2", text: "One very confident triangle" },
      { id: "o3", text: "A microwave finishing dinner" },
      { id: "o4", text: "An orchestra of squeaky shoes" }
    ]
  },
  {
    id: "FUN-NEW-09",
    kind: "funny",
    version: 1,
    question: "What would {Player1} pack for a five-minute trip?",
    options: [
      { id: "o1", text: "Three emergency outfits" },
      { id: "o2", text: "Enough snacks for a week" },
      { id: "o3", text: "A folding throne" },
      { id: "o4", text: "Absolutely no charger" }
    ]
  },
  {
    id: "FUN-NEW-10",
    kind: "funny",
    version: 1,
    question: "If {Player1} invented a new sport, what would it involve?",
    options: [
      { id: "o1", text: "Competitive blanket folding" },
      { id: "o2", text: "Synchronised snack catching" },
      { id: "o3", text: "Speed-walking away from chores" },
      { id: "o4", text: "Extreme Gahook button tapping" }
    ]
  },
  {
    id: "FUN-NEW-11",
    kind: "funny",
    version: 1,
    question: "What would {Player1}'s robot assistant need to do first?",
    options: [
      { id: "o1", text: "Locate the missing remote" },
      { id: "o2", text: "Untangle every cable" },
      { id: "o3", text: "Deliver snacks with dramatic flair" },
      { id: "o4", text: "Explain why there are 47 tabs open" }
    ]
  },
  {
    id: "FUN-NEW-12",
    kind: "funny",
    version: 1,
    question: "What would {Player1} use as a secret handshake?",
    options: [
      { id: "o1", text: "Three tiny jazz hands" },
      { id: "o2", text: "An unnecessarily formal bow" },
      { id: "o3", text: "A slow-motion high five" },
      { id: "o4", text: "A thumbs-up followed by a Gahook" }
    ]
  },
  {
    id: "FUN-NEW-13",
    kind: "funny",
    version: 1,
    question: "If {Player1} were a video-game boss, what would their weakness be?",
    options: [
      { id: "o1", text: "A well-timed compliment" },
      { id: "o2", text: "Running out of snacks" },
      { id: "o3", text: "A comfortable chair" },
      { id: "o4", text: "Someone saying “one last round”" }
    ]
  },
  {
    id: "FUN-NEW-14",
    kind: "funny",
    version: 1,
    question: "What would {Player1} sell at a wildly unsuccessful shop?",
    options: [
      { id: "o1", text: "Waterproof towels" },
      { id: "o2", text: "Invisible glitter" },
      { id: "o3", text: "Left-handed clouds" },
      { id: "o4", text: "Premium empty boxes" }
    ]
  },
  {
    id: "FUN-NEW-15",
    kind: "funny",
    version: 1,
    question: "What would {Player1} do with a personal theme-park ride?",
    options: [
      { id: "o1", text: "Add twelve snack stops" },
      { id: "o2", text: "Make the queue the whole ride" },
      { id: "o3", text: "Install a dramatic Gahook button" },
      { id: "o4", text: "Turn it into a moving nap pod" }
    ]
  },
  {
    id: "FUN-NEW-16",
    kind: "funny",
    version: 1,
    question: "If {Player1} could rename Monday, what would they call it?",
    options: [
      { id: "o1", text: "Sunday Part Two" },
      { id: "o2", text: "The Loading Screen" },
      { id: "o3", text: "Snack Preparation Day" },
      { id: "o4", text: "Absolutely Not Yet" }
    ]
  },
  {
    id: "FUN-NEW-17",
    kind: "funny",
    version: 1,
    question: "What would {Player1} choose as their royal title?",
    options: [
      { id: "o1", text: "Keeper of the Last Biscuit" },
      { id: "o2", text: "Grand Duke of Just a Second" },
      { id: "o3", text: "Supreme Button Presser" },
      { id: "o4", text: "Baron of the Blanket Fort" }
    ]
  },
  {
    id: "FUN-NEW-18",
    kind: "funny",
    version: 1,
    question: "What would {Player1} put inside a time capsule?",
    options: [
      { id: "o1", text: "A note saying “Did we win?”" },
      { id: "o2", text: "A mysterious spare cable" },
      { id: "o3", text: "A perfectly average pebble" },
      { id: "o4", text: "Instructions for the ultimate Gahook" }
    ]
  },
  {
    id: "FUN-NEW-19",
    kind: "funny",
    version: 1,
    question: "If {Player1} hosted a cooking show, what would its catchphrase be?",
    options: [
      { id: "o1", text: "We Can Probably Toast That" },
      { id: "o2", text: "Measure with Your Heart, Panic Later" },
      { id: "o3", text: "That's a Future-Me Problem" },
      { id: "o4", text: "And Now, Emergency Cheese" }
    ]
  },
  {
    id: "FUN-NEW-20",
    kind: "funny",
    version: 1,
    question: "What would {Player1} choose as the lobby's official mascot?",
    options: [
      { id: "o1", text: "A frog in tiny sunglasses" },
      { id: "o2", text: "A potato with ambition" },
      { id: "o3", text: "A duck holding a Gahook button" },
      { id: "o4", text: "A raccoon with a clipboard" }
    ]
  }
];

export const ALL_TEMPLATES: readonly PromptTemplate[] = [...EDUCATIONAL_TEMPLATES, ...FUNNY_TEMPLATES];

export function templatesForStyle(style: "educational" | "funny"): readonly PromptTemplate[] {
  return style === "educational" ? EDUCATIONAL_TEMPLATES : FUNNY_TEMPLATES;
}

export function findTemplate(id: string): PromptTemplate | null {
  return ALL_TEMPLATES.find((template) => template.id === id) ?? null;
}
