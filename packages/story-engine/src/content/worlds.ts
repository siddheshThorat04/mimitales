import { worldConfigSchema, type WorldConfig } from "../schemas";

export const WORLDS: readonly WorldConfig[] = [
  worldConfigSchema.parse({
    slug: "enchanted-forest",
    name: "Enchanted Forest",
    tagline: {
      "en-IN": "A glowing forest full of friendly creatures and hidden caves.",
      "hi-IN": "चमकते जंगल में दोस्ताना जीव और छिपी हुई गुफाएँ।",
      "mr-IN": "चमकणारे जंगल, मैत्रीपूर्ण जीव आणि दडलेल्या गुहा.",
    },
    description: {
      "en-IN":
        "Fireflies light the paths, a crystal cave glitters under the hill, and every creature has a story to share.",
      "hi-IN":
        "जुगनू रास्तों को रोशन करते हैं, पहाड़ी के नीचे क्रिस्टल की गुफा चमकती है, और हर जीव के पास सुनाने को एक कहानी है।",
      "mr-IN":
        "काजवे वाटा उजळतात, टेकडीखाली स्फटिकाची गुहा चमकते, आणि प्रत्येक जीवाकडे सांगण्यासाठी एक गोष्ट आहे.",
    },
    tone: ["cozy", "wondrous", "gentle"],
    locations: [
      {
        name: "Crystal Cave",
        description: "A cave under the hill whose walls glitter softly and hum when someone kind enters.",
      },
      {
        name: "Glowing Brook",
        description: "A shallow stream lit from below, where friendly water-sprites live.",
      },
      {
        name: "Giant Oak Village",
        description: "Tiny homes built in the roots and branches of an enormous old oak.",
      },
      {
        name: "Firefly Meadow",
        description: "An open meadow where fireflies spell out clues in the evening air.",
      },
    ],
    rules: [
      "Every creature in the forest is friendly or can be befriended; there are no villains, only misunderstandings.",
      "Magic exists to help those who are kind and curious.",
      "Problems are solved with kindness, cleverness and teamwork, never fighting.",
      "It is always cozy and safe: night is lit by fireflies and moonlight, never menacing.",
      "No real-world brands, characters, people or places.",
    ],
    storyHooks: [
      "The moon crystal that lights the Crystal Cave has gone missing.",
      "A baby firefly has lost its glow and needs help finding it.",
      "A locked door has appeared in the roots of the Giant Oak, and nobody knows who built it.",
    ],
  }),
  worldConfigSchema.parse({
    slug: "sky-islands",
    name: "Sky Islands",
    tagline: {
      "en-IN": "Floating islands joined by rope bridges and wind-boats.",
      "hi-IN": "दोरी के पुलों और हवा की नावों से जुड़े तैरते द्वीप।",
      "mr-IN": "दोरीचे पूल आणि वाऱ्याच्या नावांनी जोडलेली तरंगती बेटे.",
    },
    description: {
      "en-IN":
        "Windmills spin, rainbows spill from waterfalls, and lantern-lit harbours wait in the clouds.",
      "hi-IN":
        "पवनचक्कियाँ घूमती हैं, झरनों से इंद्रधनुष बिखरते हैं, और बादलों में लालटेन से जगमगाते बंदरगाह इंतज़ार करते हैं।",
      "mr-IN":
        "पवनचक्क्या फिरतात, धबधब्यांतून इंद्रधनुष्ये सांडतात, आणि ढगांमध्ये कंदिलांनी उजळलेली बंदरे वाट पाहतात.",
    },
    tone: ["adventurous", "bright", "playful"],
    locations: [
      {
        name: "Cloud Harbor",
        description: "A bustling harbour where wind-boats are tied to cloud-posts.",
      },
      {
        name: "Windmill Isle",
        description: "An island of windmills that spin out gentle music.",
      },
      {
        name: "Rainbow Falls",
        description: "A waterfall that spills rainbows into the sky.",
      },
      {
        name: "Lantern Isle",
        description: "An island where lanterns float up each evening to light the way home.",
      },
    ],
    rules: [
      "The islands are friendly places; any danger is mild, such as getting lost or a wobbly bridge, and always solvable.",
      "Wind and weather are playful, never destructive or frightening.",
      "Never describe falling or heights as frightening; wind-boats and soft clouds always keep travellers safe.",
      "Problems are solved with cleverness, teamwork and kindness, never fighting.",
      "No real-world brands, characters, people or places.",
    ],
    storyHooks: [
      "A rainbow from Rainbow Falls has turned grey and needs its colours back.",
      "The lantern that guides ships home to Cloud Harbor has stopped glowing.",
      "A message in a bottle arrives from an island nobody has ever visited.",
    ],
  }),
];