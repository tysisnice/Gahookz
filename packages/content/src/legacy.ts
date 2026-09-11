// The legacy prompt banks, migrated out of inline arrays.
//
// These lived as three arrays in app.jsx and three more in server.js, which is
// how the client and the server drifted: each picked content its own way and
// neither honoured the host's chosen style. They are here with stable ids so a
// question can be traced back to its source, and deduplicated across banks --
// several prompts appeared in more than one array.
//
// Shapes vary because the originals did: party prompts offer two options,
// Majority four, educational ones carry a key, and Herd seeds carry none. That
// is preserved rather than flattened, so nothing is invented to fit a schema.

import type { TemplateOption } from "./templates.ts";

export interface LegacyTemplate {
  readonly id: string;
  readonly kind: "opinion" | "factual" | "seed";
  readonly version: number;
  readonly question: string;
  readonly options: readonly TemplateOption[];
  /** Set only for factual entries. Server-only until the reveal. */
  readonly factualAnswerId: string | null;
}

export const LEGACY_TEMPLATES: readonly LegacyTemplate[] = [
  {
    id: "PARTY-001",
    kind: "opinion",
    version: 1,
    question: "Who is most likely to become famous for something ridiculous?",
    options: [
      { id: "o1", text: "The loudest person" },
      { id: "o2", text: "The quiet wildcard" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-002",
    kind: "opinion",
    version: 1,
    question: "What is the best snack to bring to a chaotic party?",
    options: [
      { id: "o1", text: "Emergency pizza" },
      { id: "o2", text: "A suspicious cheese wheel" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-003",
    kind: "opinion",
    version: 1,
    question: "Who would survive the longest with no phone for a week?",
    options: [
      { id: "o1", text: "The outdoorsy one" },
      { id: "o2", text: "The one with a secret spare" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-004",
    kind: "opinion",
    version: 1,
    question: "What song instantly makes the room worse in a funny way?",
    options: [
      { id: "o1", text: "A recorder solo" },
      { id: "o2", text: "An eight-minute remix" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-005",
    kind: "opinion",
    version: 1,
    question: "Who is most likely to accidentally start a group chat argument?",
    options: [
      { id: "o1", text: "The accidental replier" },
      { id: "o2", text: "The chaos commentator" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-006",
    kind: "opinion",
    version: 1,
    question: "What is the funniest thing to find in someone's fridge?",
    options: [
      { id: "o1", text: "One labelled grape" },
      { id: "o2", text: "A locked lunchbox" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-007",
    kind: "opinion",
    version: 1,
    question: "Who would be the worst person to trust with a secret mission?",
    options: [
      { id: "o1", text: "The oversharer" },
      { id: "o2", text: "The dramatic whisperer" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-008",
    kind: "opinion",
    version: 1,
    question: "What would be the worst prize to win on live TV?",
    options: [
      { id: "o1", text: "A damp certificate" },
      { id: "o2", text: "Someone else's sock" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-009",
    kind: "opinion",
    version: 1,
    question: "Who is most likely to laugh at the wrong moment?",
    options: [
      { id: "o1", text: "The nervous laugher" },
      { id: "o2", text: "The resident menace" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-010",
    kind: "opinion",
    version: 1,
    question: "What is the most suspicious thing to say before leaving a room?",
    options: [
      { id: "o1", text: "You saw nothing" },
      { id: "o2", text: "That should stop smoking soon" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-011",
    kind: "opinion",
    version: 1,
    question: "Who would make the best fake celebrity?",
    options: [
      { id: "o1", text: "The sunglasses expert" },
      { id: "o2", text: "The confident nobody" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-012",
    kind: "opinion",
    version: 1,
    question: "What is the worst thing to name a pet?",
    options: [
      { id: "o1", text: "Password" },
      { id: "o2", text: "Emergency Contact" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-013",
    kind: "opinion",
    version: 1,
    question: "Who would be class clown even as an adult?",
    options: [
      { id: "o1", text: "The meeting interrupter" },
      { id: "o2", text: "The office prankster" }
    ],
    factualAnswerId: null
  },
  {
    id: "GEN-MAJ-001",
    kind: "opinion",
    version: 1,
    question: "What is the funniest excuse for being late?",
    options: [
      { id: "o1", text: "Traffic" },
      { id: "o2", text: "Lost my keys" },
      { id: "o3", text: "Needed a snack" },
      { id: "o4", text: "My pet objected" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-014",
    kind: "opinion",
    version: 1,
    question: "Who is most likely to make a PowerPoint for no reason?",
    options: [
      { id: "o1", text: "The spreadsheet fan" },
      { id: "o2", text: "The self-appointed expert" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-015",
    kind: "opinion",
    version: 1,
    question: "What food has no business being eaten in a car?",
    options: [
      { id: "o1", text: "Boiling soup" },
      { id: "o2", text: "A tower of nachos" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-016",
    kind: "opinion",
    version: 1,
    question: "Who would panic first in a harmless escape room?",
    options: [
      { id: "o1", text: "The door shaker" },
      { id: "o2", text: "The clue overthinker" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-017",
    kind: "opinion",
    version: 1,
    question: "What is the best fake job title?",
    options: [
      { id: "o1", text: "Senior Vibe Inspector" },
      { id: "o2", text: "Regional Snack Director" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-018",
    kind: "opinion",
    version: 1,
    question: "Who would be easiest to distract with a shiny object?",
    options: [
      { id: "o1", text: "The curious one" },
      { id: "o2", text: "The bargain hunter" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-019",
    kind: "opinion",
    version: 1,
    question: "What is the worst thing to hear from a pilot?",
    options: [
      { id: "o1", text: "Which button is land?" },
      { id: "o2", text: "Anyone seen my glasses?" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-020",
    kind: "opinion",
    version: 1,
    question: "Who would accidentally join the wrong wedding?",
    options: [
      { id: "o1", text: "The free-food hunter" },
      { id: "o2", text: "The person who never checks invites" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-021",
    kind: "opinion",
    version: 1,
    question: "What is the funniest thing to shout during a board game?",
    options: [
      { id: "o1", text: "I invoke diplomacy!" },
      { id: "o2", text: "The dice know too much!" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-022",
    kind: "opinion",
    version: 1,
    question: "Who is most likely to become a local legend?",
    options: [
      { id: "o1", text: "The neighbourhood storyteller" },
      { id: "o2", text: "The accidental hero" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-001",
    kind: "opinion",
    version: 1,
    question: "What is the most cursed pizza topping?",
    options: [
      { id: "o1", text: "Warm grapes" },
      { id: "o2", text: "Mint toothpaste" },
      { id: "o3", text: "Cold peas" },
      { id: "o4", text: "Banana slices" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-023",
    kind: "opinion",
    version: 1,
    question: "Who would lose a staring contest to a statue?",
    options: [
      { id: "o1", text: "The serial blinker" },
      { id: "o2", text: "The easily intimidated one" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-002",
    kind: "opinion",
    version: 1,
    question: "What is the worst theme for a birthday party?",
    options: [
      { id: "o1", text: "Tax audit" },
      { id: "o2", text: "Airport security" },
      { id: "o3", text: "Dentist waiting room" },
      { id: "o4", text: "Mandatory meeting" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-024",
    kind: "opinion",
    version: 1,
    question: "Who would bring a spreadsheet to a barbecue?",
    options: [
      { id: "o1", text: "The planning enthusiast" },
      { id: "o2", text: "The sausage accountant" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-003",
    kind: "opinion",
    version: 1,
    question: "What is the funniest thing to put on a trophy?",
    options: [
      { id: "o1", text: "Best at sitting" },
      { id: "o2", text: "Most improved napper" },
      { id: "o3", text: "World's okayest effort" },
      { id: "o4", text: "Participation champion" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-025",
    kind: "opinion",
    version: 1,
    question: "Who would be the villain in a very low budget movie?",
    options: [
      { id: "o1", text: "The one with a cape" },
      { id: "o2", text: "The person holding the torch" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-026",
    kind: "opinion",
    version: 1,
    question: "What is the most dramatic way to leave a room?",
    options: [
      { id: "o1", text: "Smoke bomb and trip" },
      { id: "o2", text: "Slow clap while reversing" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-027",
    kind: "opinion",
    version: 1,
    question: "What object would make the rudest roommate?",
    options: [
      { id: "o1", text: "A judgmental mirror" },
      { id: "o2", text: "A screaming kettle" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-028",
    kind: "opinion",
    version: 1,
    question: "Who would accidentally become the leader of a strange club?",
    options: [
      { id: "o1", text: "The enthusiastic joiner" },
      { id: "o2", text: "The person with matching hats" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-004",
    kind: "opinion",
    version: 1,
    question: "What is the worst slogan for a fancy restaurant?",
    options: [
      { id: "o1", text: "Probably edible" },
      { id: "o2", text: "Forks cost extra" },
      { id: "o3", text: "Food may vary" },
      { id: "o4", text: "Chew at your own risk" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-029",
    kind: "opinion",
    version: 1,
    question: "Who would be first to befriend an alien?",
    options: [
      { id: "o1", text: "The fearless chatterbox" },
      { id: "o2", text: "The snack ambassador" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-030",
    kind: "opinion",
    version: 1,
    question: "What should never be delivered by drone?",
    options: [
      { id: "o1", text: "A bowl of soup" },
      { id: "o2", text: "An angry goose" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-031",
    kind: "opinion",
    version: 1,
    question: "Who would turn a minor inconvenience into a documentary?",
    options: [
      { id: "o1", text: "The dramatic narrator" },
      { id: "o2", text: "The person with three cameras" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-032",
    kind: "opinion",
    version: 1,
    question: "What is the least reassuring thing a dentist could say?",
    options: [
      { id: "o1", text: "This is new" },
      { id: "o2", text: "Hold my sandwich" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-033",
    kind: "opinion",
    version: 1,
    question: "Who would win an argument against a vending machine?",
    options: [
      { id: "o1", text: "The relentless negotiator" },
      { id: "o2", text: "The professional button presser" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-034",
    kind: "opinion",
    version: 1,
    question: "What is the worst thing to discover can talk?",
    options: [
      { id: "o1", text: "Your alarm clock" },
      { id: "o2", text: "The leftovers" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-035",
    kind: "opinion",
    version: 1,
    question: "Who would wear a disguise and still be instantly recognizable?",
    options: [
      { id: "o1", text: "The loud walker" },
      { id: "o2", text: "The person in a fake moustache" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-036",
    kind: "opinion",
    version: 1,
    question: "Who would accidentally adopt a traffic cone on the way home?",
    options: [
      { id: "o1", text: "The sentimental collector" },
      { id: "o2", text: "The one who names everything" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-037",
    kind: "opinion",
    version: 1,
    question: "What is the worst thing to bring to karaoke night?",
    options: [
      { id: "o1", text: "A vuvuzela" },
      { id: "o2", text: "A personal fog machine" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-038",
    kind: "opinion",
    version: 1,
    question: "Who would turn a grocery run into an epic quest?",
    options: [
      { id: "o1", text: "The dramatic navigator" },
      { id: "o2", text: "The snack side-quester" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-039",
    kind: "opinion",
    version: 1,
    question: "What would make the worst mascot for the group?",
    options: [
      { id: "o1", text: "An anxious pigeon" },
      { id: "o2", text: "A haunted sandwich" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-040",
    kind: "opinion",
    version: 1,
    question: "Who is most likely to send a voice note from the same room?",
    options: [
      { id: "o1", text: "The born narrator" },
      { id: "o2", text: "The champion of not standing up" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-041",
    kind: "opinion",
    version: 1,
    question: "What is the funniest emergency announcement at a party?",
    options: [
      { id: "o1", text: "The cake has learned to drive" },
      { id: "o2", text: "The balloons have unionised" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-042",
    kind: "opinion",
    version: 1,
    question: "Who would get banned from mini golf first?",
    options: [
      { id: "o1", text: "The windmill negotiator" },
      { id: "o2", text: "The suspicious scorekeeper" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-005",
    kind: "opinion",
    version: 1,
    question: "What is the most suspicious housewarming gift?",
    options: [
      { id: "o1", text: "A key to nothing" },
      { id: "o2", text: "A toaster portrait" },
      { id: "o3", text: "One glove" },
      { id: "o4", text: "An unlabelled map" }
    ],
    factualAnswerId: null
  },
  {
    id: "PARTY-043",
    kind: "opinion",
    version: 1,
    question: "Who would misunderstand a costume party theme the most?",
    options: [
      { id: "o1", text: "The astronaut at a medieval feast" },
      { id: "o2", text: "The knight at beach day" }
    ],
    factualAnswerId: null
  },
  {
    id: "GEN-MAJ-002",
    kind: "opinion",
    version: 1,
    question: "What is the least useful superpower at a party?",
    options: [
      { id: "o1", text: "Warm ice" },
      { id: "o2", text: "Silent karaoke" },
      { id: "o3", text: "Slow teleporting" },
      { id: "o4", text: "Invisible socks" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-006",
    kind: "opinion",
    version: 1,
    question: "Which snack disappears first at every party?",
    options: [
      { id: "o1", text: "Hot chips" },
      { id: "o2", text: "Pizza" },
      { id: "o3", text: "Chocolate" },
      { id: "o4", text: "Cheese" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-007",
    kind: "opinion",
    version: 1,
    question: "Which tiny inconvenience causes the biggest overreaction?",
    options: [
      { id: "o1", text: "Slow Wi-Fi" },
      { id: "o2", text: "Wet socks" },
      { id: "o3", text: "Low battery" },
      { id: "o4", text: "A squeaky door" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-008",
    kind: "opinion",
    version: 1,
    question: "Which animal has the most chaotic energy?",
    options: [
      { id: "o1", text: "Goose" },
      { id: "o2", text: "Raccoon" },
      { id: "o3", text: "Monkey" },
      { id: "o4", text: "Seagull" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-009",
    kind: "opinion",
    version: 1,
    question: "What is the best excuse for leaving a party early?",
    options: [
      { id: "o1", text: "Early morning" },
      { id: "o2", text: "Pet emergency" },
      { id: "o3", text: "Battery is dying" },
      { id: "o4", text: "Social battery is empty" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-010",
    kind: "opinion",
    version: 1,
    question: "Which food is hardest to eat while looking dignified?",
    options: [
      { id: "o1", text: "Spaghetti" },
      { id: "o2", text: "Tacos" },
      { id: "o3", text: "Corn on the cob" },
      { id: "o4", text: "A giant burger" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-011",
    kind: "opinion",
    version: 1,
    question: "What is the most suspicious sentence to hear from a friend?",
    options: [
      { id: "o1", text: "Trust me" },
      { id: "o2", text: "Don't look behind you" },
      { id: "o3", text: "I can explain" },
      { id: "o4", text: "It was like that already" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-012",
    kind: "opinion",
    version: 1,
    question: "Which household object would make the worst roommate?",
    options: [
      { id: "o1", text: "Printer" },
      { id: "o2", text: "Alarm clock" },
      { id: "o3", text: "Blender" },
      { id: "o4", text: "Vacuum" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-013",
    kind: "opinion",
    version: 1,
    question: "What would be the worst name for a boat?",
    options: [
      { id: "o1", text: "Unsinkable 2" },
      { id: "o2", text: "Tax Return" },
      { id: "o3", text: "Probably Fine" },
      { id: "o4", text: "Moist Vessel" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-014",
    kind: "opinion",
    version: 1,
    question: "Which song choice ends karaoke night fastest?",
    options: [
      { id: "o1", text: "A ten-minute ballad" },
      { id: "o2", text: "Baby Shark" },
      { id: "o3", text: "An opera solo" },
      { id: "o4", text: "The same song again" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-015",
    kind: "opinion",
    version: 1,
    question: "What should never be described as moist?",
    options: [
      { id: "o1", text: "A handshake" },
      { id: "o2", text: "A pillow" },
      { id: "o3", text: "A wallet" },
      { id: "o4", text: "The carpet" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-016",
    kind: "opinion",
    version: 1,
    question: "Which smell ruins a heroic entrance most?",
    options: [
      { id: "o1", text: "Old cheese" },
      { id: "o2", text: "Wet carpet" },
      { id: "o3", text: "Burnt popcorn" },
      { id: "o4", text: "Mystery fridge" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-017",
    kind: "opinion",
    version: 1,
    question: "Who in the room is most likely to accidentally become famous?",
    options: [
      { id: "o1", text: "The loud one" },
      { id: "o2", text: "The quiet wildcard" },
      { id: "o3", text: "The oversharer" },
      { id: "o4", text: "The snack expert" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-018",
    kind: "opinion",
    version: 1,
    question: "Which prize would earn the weakest applause?",
    options: [
      { id: "o1", text: "One sock" },
      { id: "o2", text: "A damp coupon" },
      { id: "o3", text: "A tiny spoon" },
      { id: "o4", text: "A mystery key" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-019",
    kind: "opinion",
    version: 1,
    question: "Which app steals the most time?",
    options: [
      { id: "o1", text: "TikTok" },
      { id: "o2", text: "YouTube" },
      { id: "o3", text: "Instagram" },
      { id: "o4", text: "The weather app somehow" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-020",
    kind: "opinion",
    version: 1,
    question: "What is the least reassuring thing a pilot could say?",
    options: [
      { id: "o1", text: "Which button lands us?" },
      { id: "o2", text: "This is probably fine" },
      { id: "o3", text: "Anyone seen my glasses?" },
      { id: "o4", text: "That's a new noise" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-021",
    kind: "opinion",
    version: 1,
    question: "Which object is judging you the hardest?",
    options: [
      { id: "o1", text: "Bathroom scale" },
      { id: "o2", text: "Unread book" },
      { id: "o3", text: "Smoke alarm" },
      { id: "o4", text: "Empty laundry basket" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-022",
    kind: "opinion",
    version: 1,
    question: "What is the strongest sign a party has gone wrong?",
    options: [
      { id: "o1", text: "The lights are on" },
      { id: "o2", text: "Someone brought a spreadsheet" },
      { id: "o3", text: "The host is asleep" },
      { id: "o4", text: "A chair is missing" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-023",
    kind: "opinion",
    version: 1,
    question: "Which fake job sounds most believable?",
    options: [
      { id: "o1", text: "Cloud inspector" },
      { id: "o2", text: "Snack lawyer" },
      { id: "o3", text: "Chair detective" },
      { id: "o4", text: "Vibe plumber" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-024",
    kind: "opinion",
    version: 1,
    question: "Which superpower would be least useful?",
    options: [
      { id: "o1", text: "Warm ice cubes" },
      { id: "o2", text: "Invisible socks" },
      { id: "o3", text: "One-second time travel" },
      { id: "o4", text: "Talking to printers" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-025",
    kind: "opinion",
    version: 1,
    question: "What is the worst thing to find in your shoe?",
    options: [
      { id: "o1", text: "Soup" },
      { id: "o2", text: "A note" },
      { id: "o3", text: "One cold pea" },
      { id: "o4", text: "Another smaller shoe" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-026",
    kind: "opinion",
    version: 1,
    question: "Which food has the strongest main-character energy?",
    options: [
      { id: "o1", text: "Lasagne" },
      { id: "o2", text: "Tacos" },
      { id: "o3", text: "Sushi" },
      { id: "o4", text: "Garlic bread" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-027",
    kind: "opinion",
    version: 1,
    question: "What is the most dramatic household appliance?",
    options: [
      { id: "o1", text: "Toaster" },
      { id: "o2", text: "Blender" },
      { id: "o3", text: "Smoke alarm" },
      { id: "o4", text: "Robot vacuum" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-028",
    kind: "opinion",
    version: 1,
    question: "Which animal would be the worst boss?",
    options: [
      { id: "o1", text: "Goose" },
      { id: "o2", text: "Cat" },
      { id: "o3", text: "Dolphin" },
      { id: "o4", text: "Horse" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-029",
    kind: "opinion",
    version: 1,
    question: "What is the funniest emergency announcement?",
    options: [
      { id: "o1", text: "The cake can drive" },
      { id: "o2", text: "The balloons unionised" },
      { id: "o3", text: "We lost Tuesday" },
      { id: "o4", text: "The floor is optional" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-030",
    kind: "opinion",
    version: 1,
    question: "Which item is least useful in an action movie?",
    options: [
      { id: "o1", text: "Kazoo" },
      { id: "o2", text: "Feather" },
      { id: "o3", text: "Nice hat" },
      { id: "o4", text: "Salad spinner" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-031",
    kind: "opinion",
    version: 1,
    question: "Which word sounds most like a secret password?",
    options: [
      { id: "o1", text: "Plonk" },
      { id: "o2", text: "Noodle" },
      { id: "o3", text: "Chair" },
      { id: "o4", text: "Mega" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-032",
    kind: "opinion",
    version: 1,
    question: "Which vehicle makes the funniest dramatic arrival?",
    options: [
      { id: "o1", text: "Forklift" },
      { id: "o2", text: "Scooter" },
      { id: "o3", text: "Tiny train" },
      { id: "o4", text: "Pedal boat" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-033",
    kind: "opinion",
    version: 1,
    question: "Which snack is hardest to share fairly?",
    options: [
      { id: "o1", text: "Hot chips" },
      { id: "o2", text: "Nachos" },
      { id: "o3", text: "Chocolate" },
      { id: "o4", text: "Popcorn" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-034",
    kind: "opinion",
    version: 1,
    question: "What is the best wrong answer to almost any question?",
    options: [
      { id: "o1", text: "A goose" },
      { id: "o2", text: "Tuesday" },
      { id: "o3", text: "More cheese" },
      { id: "o4", text: "Ask the dog" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-035",
    kind: "opinion",
    version: 1,
    question: "Which room in a house becomes haunted first?",
    options: [
      { id: "o1", text: "Basement" },
      { id: "o2", text: "Bathroom" },
      { id: "o3", text: "Spare room" },
      { id: "o4", text: "Laundry" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-036",
    kind: "opinion",
    version: 1,
    question: "What is the worst thing to hear from a dentist?",
    options: [
      { id: "o1", text: "That's interesting" },
      { id: "o2", text: "Hold my sandwich" },
      { id: "o3", text: "This is new" },
      { id: "o4", text: "Do you smell smoke?" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-037",
    kind: "opinion",
    version: 1,
    question: "Which social mistake is hardest to recover from?",
    options: [
      { id: "o1", text: "Wrong group chat" },
      { id: "o2", text: "Forgot their name" },
      { id: "o3", text: "Waved at a stranger" },
      { id: "o4", text: "Replied all" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-038",
    kind: "opinion",
    version: 1,
    question: "What is the funniest low-budget movie title?",
    options: [
      { id: "o1", text: "Slightly Fast" },
      { id: "o2", text: "Jurassic Car Park" },
      { id: "o3", text: "Mission: Possible" },
      { id: "o4", text: "The Okay Escape" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-039",
    kind: "opinion",
    version: 1,
    question: "Which breakfast food is most overrated?",
    options: [
      { id: "o1", text: "Cereal" },
      { id: "o2", text: "Pancakes" },
      { id: "o3", text: "Avocado toast" },
      { id: "o4", text: "Cold pizza" }
    ],
    factualAnswerId: null
  },
  {
    id: "MAJ-040",
    kind: "opinion",
    version: 1,
    question: "What would make the worst group-chat name?",
    options: [
      { id: "o1", text: "Definitely Not Gossip" },
      { id: "o2", text: "Mum Is Typing" },
      { id: "o3", text: "Reply All" },
      { id: "o4", text: "The Incident" }
    ],
    factualAnswerId: null
  },
  {
    id: "EDU-LEGACY-001",
    kind: "factual",
    version: 1,
    question: "Which planet is closest to the Sun?",
    options: [
      { id: "o1", text: "Mercury" },
      { id: "o2", text: "Venus" },
      { id: "o3", text: "Earth" },
      { id: "o4", text: "Mars" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-002",
    kind: "factual",
    version: 1,
    question: "What gas do plants absorb during photosynthesis?",
    options: [
      { id: "o1", text: "Carbon dioxide" },
      { id: "o2", text: "Oxygen" },
      { id: "o3", text: "Hydrogen" },
      { id: "o4", text: "Helium" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-003",
    kind: "factual",
    version: 1,
    question: "Which ocean is the largest?",
    options: [
      { id: "o1", text: "Pacific Ocean" },
      { id: "o2", text: "Atlantic Ocean" },
      { id: "o3", text: "Indian Ocean" },
      { id: "o4", text: "Arctic Ocean" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-004",
    kind: "factual",
    version: 1,
    question: "What is 12 multiplied by 8?",
    options: [
      { id: "o1", text: "96" },
      { id: "o2", text: "86" },
      { id: "o3", text: "92" },
      { id: "o4", text: "108" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-005",
    kind: "factual",
    version: 1,
    question: "Which organ pumps blood around the body?",
    options: [
      { id: "o1", text: "Heart" },
      { id: "o2", text: "Liver" },
      { id: "o3", text: "Lung" },
      { id: "o4", text: "Kidney" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-006",
    kind: "factual",
    version: 1,
    question: "What is the chemical symbol for gold?",
    options: [
      { id: "o1", text: "Au" },
      { id: "o2", text: "Ag" },
      { id: "o3", text: "Go" },
      { id: "o4", text: "Gd" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-007",
    kind: "factual",
    version: 1,
    question: "Who wrote Romeo and Juliet?",
    options: [
      { id: "o1", text: "William Shakespeare" },
      { id: "o2", text: "Jane Austen" },
      { id: "o3", text: "Charles Dickens" },
      { id: "o4", text: "George Orwell" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-008",
    kind: "factual",
    version: 1,
    question: "Which fraction is equal to one half?",
    options: [
      { id: "o1", text: "3/6" },
      { id: "o2", text: "2/3" },
      { id: "o3", text: "4/6" },
      { id: "o4", text: "5/8" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-009",
    kind: "factual",
    version: 1,
    question: "What is the square root of 144?",
    options: [
      { id: "o1", text: "12" },
      { id: "o2", text: "10" },
      { id: "o3", text: "14" },
      { id: "o4", text: "16" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-010",
    kind: "factual",
    version: 1,
    question: "How many degrees are in the interior angles of a triangle?",
    options: [
      { id: "o1", text: "180 degrees" },
      { id: "o2", text: "90 degrees" },
      { id: "o3", text: "270 degrees" },
      { id: "o4", text: "360 degrees" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-011",
    kind: "factual",
    version: 1,
    question: "Which fraction is equal to 0.75?",
    options: [
      { id: "o1", text: "3/4" },
      { id: "o2", text: "2/3" },
      { id: "o3", text: "4/5" },
      { id: "o4", text: "7/10" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-012",
    kind: "factual",
    version: 1,
    question: "What is the perimeter of a rectangle that is 5 cm by 3 cm?",
    options: [
      { id: "o1", text: "16 cm" },
      { id: "o2", text: "8 cm" },
      { id: "o3", text: "15 cm" },
      { id: "o4", text: "25 cm" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-013",
    kind: "factual",
    version: 1,
    question: "Which of these numbers is prime?",
    options: [
      { id: "o1", text: "29" },
      { id: "o2", text: "21" },
      { id: "o3", text: "27" },
      { id: "o4", text: "39" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-014",
    kind: "factual",
    version: 1,
    question: "What is 3 to the power of 4?",
    options: [
      { id: "o1", text: "81" },
      { id: "o2", text: "12" },
      { id: "o3", text: "64" },
      { id: "o4", text: "243" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-015",
    kind: "factual",
    version: 1,
    question: "What is the mean of 4, 6, and 8?",
    options: [
      { id: "o1", text: "6" },
      { id: "o2", text: "5" },
      { id: "o3", text: "7" },
      { id: "o4", text: "18" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-016",
    kind: "factual",
    version: 1,
    question: "What is 15 percent of 200?",
    options: [
      { id: "o1", text: "30" },
      { id: "o2", text: "15" },
      { id: "o3", text: "25" },
      { id: "o4", text: "45" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-017",
    kind: "factual",
    version: 1,
    question: "If 2x + 6 = 14, what is x?",
    options: [
      { id: "o1", text: "4" },
      { id: "o2", text: "3" },
      { id: "o3", text: "7" },
      { id: "o4", text: "10" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-018",
    kind: "factual",
    version: 1,
    question: "Which formula gives the area of a circle?",
    options: [
      { id: "o1", text: "Pi times radius squared" },
      { id: "o2", text: "Two times pi times radius" },
      { id: "o3", text: "Pi times diameter" },
      { id: "o4", text: "Radius squared divided by two" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-019",
    kind: "factual",
    version: 1,
    question: "What is the SI unit of electric current?",
    options: [
      { id: "o1", text: "Ampere" },
      { id: "o2", text: "Volt" },
      { id: "o3", text: "Watt" },
      { id: "o4", text: "Ohm" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-020",
    kind: "factual",
    version: 1,
    question: "Which law links force, mass, and acceleration?",
    options: [
      { id: "o1", text: "Newton's second law" },
      { id: "o2", text: "Ohm's law" },
      { id: "o3", text: "Hooke's law" },
      { id: "o4", text: "Boyle's law" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-021",
    kind: "factual",
    version: 1,
    question: "Approximately how fast does light travel in a vacuum?",
    options: [
      { id: "o1", text: "300,000 km/s" },
      { id: "o2", text: "300 km/s" },
      { id: "o3", text: "30,000 km/s" },
      { id: "o4", text: "3,000,000 km/s" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-022",
    kind: "factual",
    version: 1,
    question: "At sea level, what temperature does pure water boil at?",
    options: [
      { id: "o1", text: "100 degrees Celsius" },
      { id: "o2", text: "0 degrees Celsius" },
      { id: "o3", text: "50 degrees Celsius" },
      { id: "o4", text: "212 degrees Celsius" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-023",
    kind: "factual",
    version: 1,
    question: "Why can sound not travel through a perfect vacuum?",
    options: [
      { id: "o1", text: "There are no particles to vibrate" },
      { id: "o2", text: "It is too cold" },
      { id: "o3", text: "Gravity blocks it" },
      { id: "o4", text: "Light absorbs it" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-024",
    kind: "factual",
    version: 1,
    question: "A ramp is an example of which simple machine?",
    options: [
      { id: "o1", text: "Inclined plane" },
      { id: "o2", text: "Pulley" },
      { id: "o3", text: "Lever" },
      { id: "o4", text: "Wheel and axle" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-025",
    kind: "factual",
    version: 1,
    question: "What type of energy does a moving object have?",
    options: [
      { id: "o1", text: "Kinetic energy" },
      { id: "o2", text: "Chemical energy" },
      { id: "o3", text: "Potential energy" },
      { id: "o4", text: "Nuclear energy" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-026",
    kind: "factual",
    version: 1,
    question: "Which surface produces a clear reflection of light?",
    options: [
      { id: "o1", text: "A smooth mirror" },
      { id: "o2", text: "Rough paper" },
      { id: "o3", text: "Dark carpet" },
      { id: "o4", text: "Unpolished wood" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-027",
    kind: "factual",
    version: 1,
    question: "Which material is a good electrical conductor?",
    options: [
      { id: "o1", text: "Copper" },
      { id: "o2", text: "Rubber" },
      { id: "o3", text: "Glass" },
      { id: "o4", text: "Dry wood" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-028",
    kind: "factual",
    version: 1,
    question: "Density is calculated by dividing mass by what?",
    options: [
      { id: "o1", text: "Volume" },
      { id: "o2", text: "Speed" },
      { id: "o3", text: "Temperature" },
      { id: "o4", text: "Area" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-029",
    kind: "factual",
    version: 1,
    question: "Which organelle is often called the powerhouse of the cell?",
    options: [
      { id: "o1", text: "Mitochondrion" },
      { id: "o2", text: "Nucleus" },
      { id: "o3", text: "Ribosome" },
      { id: "o4", text: "Vacuole" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-030",
    kind: "factual",
    version: 1,
    question: "How many chromosomes are normally found in a human body cell?",
    options: [
      { id: "o1", text: "46" },
      { id: "o2", text: "23" },
      { id: "o3", text: "44" },
      { id: "o4", text: "48" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-031",
    kind: "factual",
    version: 1,
    question: "Which blood cells carry most of the body's oxygen?",
    options: [
      { id: "o1", text: "Red blood cells" },
      { id: "o2", text: "White blood cells" },
      { id: "o3", text: "Platelets" },
      { id: "o4", text: "Plasma cells" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-032",
    kind: "factual",
    version: 1,
    question: "Which process makes new body cells for growth and repair?",
    options: [
      { id: "o1", text: "Mitosis" },
      { id: "o2", text: "Meiosis" },
      { id: "o3", text: "Fertilisation" },
      { id: "o4", text: "Respiration" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-033",
    kind: "factual",
    version: 1,
    question: "What is the largest organ of the human body?",
    options: [
      { id: "o1", text: "Skin" },
      { id: "o2", text: "Liver" },
      { id: "o3", text: "Lung" },
      { id: "o4", text: "Brain" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-034",
    kind: "factual",
    version: 1,
    question: "What shape is the structure of DNA?",
    options: [
      { id: "o1", text: "Double helix" },
      { id: "o2", text: "Single ring" },
      { id: "o3", text: "Triple spiral" },
      { id: "o4", text: "Flat sheet" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-035",
    kind: "factual",
    version: 1,
    question: "What does pollination transfer between flowers?",
    options: [
      { id: "o1", text: "Pollen" },
      { id: "o2", text: "Seeds" },
      { id: "o3", text: "Nectar" },
      { id: "o4", text: "Water" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-036",
    kind: "factual",
    version: 1,
    question: "Which organism is commonly a decomposer?",
    options: [
      { id: "o1", text: "Fungus" },
      { id: "o2", text: "Hawk" },
      { id: "o3", text: "Grass" },
      { id: "o4", text: "Rabbit" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-037",
    kind: "factual",
    version: 1,
    question: "What role do green plants usually have in a food chain?",
    options: [
      { id: "o1", text: "Producer" },
      { id: "o2", text: "Decomposer" },
      { id: "o3", text: "Predator" },
      { id: "o4", text: "Parasite" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-038",
    kind: "factual",
    version: 1,
    question: "Which vitamin can the skin produce with sunlight exposure?",
    options: [
      { id: "o1", text: "Vitamin D" },
      { id: "o2", text: "Vitamin A" },
      { id: "o3", text: "Vitamin B12" },
      { id: "o4", text: "Vitamin C" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-039",
    kind: "factual",
    version: 1,
    question: "What pH value is neutral at room temperature?",
    options: [
      { id: "o1", text: "7" },
      { id: "o2", text: "0" },
      { id: "o3", text: "5" },
      { id: "o4", text: "14" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-040",
    kind: "factual",
    version: 1,
    question: "What common substance has the chemical formula NaCl?",
    options: [
      { id: "o1", text: "Table salt" },
      { id: "o2", text: "Sugar" },
      { id: "o3", text: "Water" },
      { id: "o4", text: "Baking soda" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-041",
    kind: "factual",
    version: 1,
    question: "An element's atomic number tells you its number of what?",
    options: [
      { id: "o1", text: "Protons" },
      { id: "o2", text: "Neutrons" },
      { id: "o3", text: "Electron shells" },
      { id: "o4", text: "Molecules" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-042",
    kind: "factual",
    version: 1,
    question: "Which gas makes up most of Earth's atmosphere?",
    options: [
      { id: "o1", text: "Nitrogen" },
      { id: "o2", text: "Oxygen" },
      { id: "o3", text: "Carbon dioxide" },
      { id: "o4", text: "Argon" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-043",
    kind: "factual",
    version: 1,
    question: "What is the change from a gas to a liquid called?",
    options: [
      { id: "o1", text: "Condensation" },
      { id: "o2", text: "Evaporation" },
      { id: "o3", text: "Sublimation" },
      { id: "o4", text: "Melting" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-044",
    kind: "factual",
    version: 1,
    question: "What is Earth's outermost solid layer called?",
    options: [
      { id: "o1", text: "Crust" },
      { id: "o2", text: "Mantle" },
      { id: "o3", text: "Outer core" },
      { id: "o4", text: "Inner core" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-045",
    kind: "factual",
    version: 1,
    question: "Which type of rock forms through heat and pressure?",
    options: [
      { id: "o1", text: "Metamorphic" },
      { id: "o2", text: "Sedimentary" },
      { id: "o3", text: "Igneous" },
      { id: "o4", text: "Volcanic glass" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-046",
    kind: "factual",
    version: 1,
    question: "Which instrument records earthquake waves?",
    options: [
      { id: "o1", text: "Seismograph" },
      { id: "o2", text: "Barometer" },
      { id: "o3", text: "Anemometer" },
      { id: "o4", text: "Thermometer" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-047",
    kind: "factual",
    version: 1,
    question: "In the water cycle, what changes liquid water into water vapour?",
    options: [
      { id: "o1", text: "Evaporation" },
      { id: "o2", text: "Condensation" },
      { id: "o3", text: "Precipitation" },
      { id: "o4", text: "Freezing" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-048",
    kind: "factual",
    version: 1,
    question: "Which energy source is renewable?",
    options: [
      { id: "o1", text: "Solar energy" },
      { id: "o2", text: "Coal" },
      { id: "o3", text: "Natural gas" },
      { id: "o4", text: "Petrol" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-049",
    kind: "factual",
    version: 1,
    question: "Which is the largest planet in our solar system?",
    options: [
      { id: "o1", text: "Jupiter" },
      { id: "o2", text: "Earth" },
      { id: "o3", text: "Saturn" },
      { id: "o4", text: "Neptune" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-050",
    kind: "factual",
    version: 1,
    question: "About how long does Earth take to orbit the Sun?",
    options: [
      { id: "o1", text: "365.25 days" },
      { id: "o2", text: "24 hours" },
      { id: "o3", text: "30 days" },
      { id: "o4", text: "687 days" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-051",
    kind: "factual",
    version: 1,
    question: "What is the capital city of Japan?",
    options: [
      { id: "o1", text: "Tokyo" },
      { id: "o2", text: "Kyoto" },
      { id: "o3", text: "Osaka" },
      { id: "o4", text: "Seoul" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-052",
    kind: "factual",
    version: 1,
    question: "Which is the largest continent by land area?",
    options: [
      { id: "o1", text: "Asia" },
      { id: "o2", text: "Africa" },
      { id: "o3", text: "Europe" },
      { id: "o4", text: "North America" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-053",
    kind: "factual",
    version: 1,
    question: "The Equator divides Earth into which two hemispheres?",
    options: [
      { id: "o1", text: "Northern and Southern" },
      { id: "o2", text: "Eastern and Western" },
      { id: "o3", text: "Land and Ocean" },
      { id: "o4", text: "Tropical and Polar" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-054",
    kind: "factual",
    version: 1,
    question: "In which ancient civilisation did the Olympic Games begin?",
    options: [
      { id: "o1", text: "Ancient Greece" },
      { id: "o2", text: "Ancient Rome" },
      { id: "o3", text: "Ancient Egypt" },
      { id: "o4", text: "Mesopotamia" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-055",
    kind: "factual",
    version: 1,
    question: "Who is associated with developing Europe's movable-type printing press?",
    options: [
      { id: "o1", text: "Johannes Gutenberg" },
      { id: "o2", text: "Galileo Galilei" },
      { id: "o3", text: "Isaac Newton" },
      { id: "o4", text: "Leonardo da Vinci" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-056",
    kind: "factual",
    version: 1,
    question: "In which country was Magna Carta sealed in 1215?",
    options: [
      { id: "o1", text: "England" },
      { id: "o2", text: "France" },
      { id: "o3", text: "Spain" },
      { id: "o4", text: "Italy" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-057",
    kind: "factual",
    version: 1,
    question: "Which part of speech names a person, place, thing, or idea?",
    options: [
      { id: "o1", text: "Noun" },
      { id: "o2", text: "Verb" },
      { id: "o3", text: "Adjective" },
      { id: "o4", text: "Adverb" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "EDU-LEGACY-058",
    kind: "factual",
    version: 1,
    question: "What figure of speech is used in 'The classroom was a zoo'?",
    options: [
      { id: "o1", text: "Metaphor" },
      { id: "o2", text: "Simile" },
      { id: "o3", text: "Alliteration" },
      { id: "o4", text: "Onomatopoeia" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-001",
    kind: "factual",
    version: 1,
    question: "Which planet is known as the Red Planet?",
    options: [
      { id: "o1", text: "Mars" },
      { id: "o2", text: "Venus" },
      { id: "o3", text: "Jupiter" },
      { id: "o4", text: "Neptune" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-002",
    kind: "factual",
    version: 1,
    question: "What is the largest ocean on Earth?",
    options: [
      { id: "o1", text: "Pacific" },
      { id: "o2", text: "Atlantic" },
      { id: "o3", text: "Indian" },
      { id: "o4", text: "Arctic" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-003",
    kind: "factual",
    version: 1,
    question: "Which animal is famous for changing colour?",
    options: [
      { id: "o1", text: "Chameleon" },
      { id: "o2", text: "Penguin" },
      { id: "o3", text: "Dolphin" },
      { id: "o4", text: "Giraffe" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-004",
    kind: "factual",
    version: 1,
    question: "How many sides does a hexagon have?",
    options: [
      { id: "o1", text: "Six" },
      { id: "o2", text: "Five" },
      { id: "o3", text: "Seven" },
      { id: "o4", text: "Eight" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-005",
    kind: "factual",
    version: 1,
    question: "What do bees collect from flowers?",
    options: [
      { id: "o1", text: "Nectar" },
      { id: "o2", text: "Sand" },
      { id: "o3", text: "Pebbles" },
      { id: "o4", text: "Cheese" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-006",
    kind: "factual",
    version: 1,
    question: "Which instrument usually has black and white keys?",
    options: [
      { id: "o1", text: "Piano" },
      { id: "o2", text: "Trumpet" },
      { id: "o3", text: "Drums" },
      { id: "o4", text: "Violin" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-007",
    kind: "factual",
    version: 1,
    question: "What is the fastest land animal?",
    options: [
      { id: "o1", text: "Cheetah" },
      { id: "o2", text: "Horse" },
      { id: "o3", text: "Ostrich" },
      { id: "o4", text: "Kangaroo" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-008",
    kind: "factual",
    version: 1,
    question: "Which month has an extra day in a leap year?",
    options: [
      { id: "o1", text: "February" },
      { id: "o2", text: "April" },
      { id: "o3", text: "June" },
      { id: "o4", text: "November" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-009",
    kind: "factual",
    version: 1,
    question: "What is frozen water called?",
    options: [
      { id: "o1", text: "Ice" },
      { id: "o2", text: "Steam" },
      { id: "o3", text: "Mist" },
      { id: "o4", text: "Cloud" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-010",
    kind: "factual",
    version: 1,
    question: "Which shape has exactly three sides?",
    options: [
      { id: "o1", text: "Triangle" },
      { id: "o2", text: "Square" },
      { id: "o3", text: "Circle" },
      { id: "o4", text: "Pentagon" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-011",
    kind: "factual",
    version: 1,
    question: "Which food is traditionally used to make guacamole?",
    options: [
      { id: "o1", text: "Avocado" },
      { id: "o2", text: "Potato" },
      { id: "o3", text: "Apple" },
      { id: "o4", text: "Cucumber" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-012",
    kind: "factual",
    version: 1,
    question: "Which metal is liquid near room temperature?",
    options: [
      { id: "o1", text: "Mercury" },
      { id: "o2", text: "Iron" },
      { id: "o3", text: "Copper" },
      { id: "o4", text: "Silver" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-013",
    kind: "factual",
    version: 1,
    question: "How many minutes are in two hours?",
    options: [
      { id: "o1", text: "120" },
      { id: "o2", text: "90" },
      { id: "o3", text: "100" },
      { id: "o4", text: "180" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-014",
    kind: "factual",
    version: 1,
    question: "Which country is home to the pyramids of Giza?",
    options: [
      { id: "o1", text: "Egypt" },
      { id: "o2", text: "Mexico" },
      { id: "o3", text: "Greece" },
      { id: "o4", text: "India" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-015",
    kind: "factual",
    version: 1,
    question: "What gas do plants absorb from the air?",
    options: [
      { id: "o1", text: "Carbon dioxide" },
      { id: "o2", text: "Oxygen" },
      { id: "o3", text: "Helium" },
      { id: "o4", text: "Hydrogen" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-016",
    kind: "factual",
    version: 1,
    question: "Which animal is the largest living mammal?",
    options: [
      { id: "o1", text: "Blue whale" },
      { id: "o2", text: "Elephant" },
      { id: "o3", text: "Giraffe" },
      { id: "o4", text: "Hippopotamus" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-017",
    kind: "factual",
    version: 1,
    question: "What is the main ingredient in hummus?",
    options: [
      { id: "o1", text: "Chickpeas" },
      { id: "o2", text: "Rice" },
      { id: "o3", text: "Potatoes" },
      { id: "o4", text: "Lentils" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-018",
    kind: "factual",
    version: 1,
    question: "Which continent contains the South Pole?",
    options: [
      { id: "o1", text: "Antarctica" },
      { id: "o2", text: "Europe" },
      { id: "o3", text: "Asia" },
      { id: "o4", text: "Africa" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-019",
    kind: "factual",
    version: 1,
    question: "How many colours are traditionally named in a rainbow?",
    options: [
      { id: "o1", text: "Seven" },
      { id: "o2", text: "Five" },
      { id: "o3", text: "Six" },
      { id: "o4", text: "Eight" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-QUIZ-020",
    kind: "factual",
    version: 1,
    question: "What is the square root of 81?",
    options: [
      { id: "o1", text: "Nine" },
      { id: "o2", text: "Eight" },
      { id: "o3", text: "Seven" },
      { id: "o4", text: "Ten" }
    ],
    factualAnswerId: "o1"
  },
  {
    id: "GEN-MAJ-003",
    kind: "opinion",
    version: 1,
    question: "What is the best terrible prize?",
    options: [
      { id: "o1", text: "One sock" },
      { id: "o2", text: "A damp coupon" },
      { id: "o3", text: "Tiny trophy" },
      { id: "o4", text: "Mystery key" }
    ],
    factualAnswerId: null
  },
  {
    id: "GEN-HERD-001",
    kind: "seed",
    version: 1,
    question: "What should be illegal to put on pizza?",
    options: [],
    factualAnswerId: null
  },
  {
    id: "GEN-HERD-002",
    kind: "seed",
    version: 1,
    question: "What would make a terrible name for a superhero?",
    options: [],
    factualAnswerId: null
  },
  {
    id: "GEN-HERD-003",
    kind: "seed",
    version: 1,
    question: "What is the weirdest thing to bring to a job interview?",
    options: [],
    factualAnswerId: null
  },
  {
    id: "GEN-HERD-004",
    kind: "seed",
    version: 1,
    question: "What would a goose do with unlimited money?",
    options: [],
    factualAnswerId: null
  },
  {
    id: "GEN-HERD-005",
    kind: "seed",
    version: 1,
    question: "What is the least useful thing to shout during an emergency?",
    options: [],
    factualAnswerId: null
  },
  {
    id: "GEN-HERD-006",
    kind: "seed",
    version: 1,
    question: "What would instantly ruin a fancy dinner?",
    options: [],
    factualAnswerId: null
  },
  {
    id: "GEN-HERD-007",
    kind: "seed",
    version: 1,
    question: "What is the most suspicious item to keep in a fridge?",
    options: [],
    factualAnswerId: null
  },
  {
    id: "GEN-HERD-008",
    kind: "seed",
    version: 1,
    question: "What would be the worst surprise inside a birthday cake?",
    options: [],
    factualAnswerId: null
  },
  {
    id: "GEN-HERD-009",
    kind: "seed",
    version: 1,
    question: "What is a terrible slogan for a theme park?",
    options: [],
    factualAnswerId: null
  },
  {
    id: "GEN-HERD-010",
    kind: "seed",
    version: 1,
    question: "What would make the moon quit its job?",
    options: [],
    factualAnswerId: null
  },
  {
    id: "GEN-HERD-011",
    kind: "seed",
    version: 1,
    question: "What is the funniest reason to miss a wedding?",
    options: [],
    factualAnswerId: null
  }
];

export function legacyByKind(kind: LegacyTemplate["kind"]): readonly LegacyTemplate[] {
  return LEGACY_TEMPLATES.filter((template) => template.kind === kind);
}
