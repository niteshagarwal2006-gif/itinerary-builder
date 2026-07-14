import type { Itinerary } from "./types";

/** Sample itinerary drawn from the real "IndeduSud v3" file, for testing. */
export const sampleItinerary: Itinerary = {
  preparedFor: "Terres du Monde",
  tripSummary: {
    origin: "PARIS",
    arrivalCity: "CHENNAI",
    departureCity: "BOMBAY",
    finalDestination: "PARIS",
    dates: "11 – 22 AVRIL 2027",
    nights: 11,
    days: 12,
    mealPlan: "SÉJOUR EN PENSION COMPLÈTE – PETIT-DÉJEUNER, DÉJEUNER ET DÎNER INCLUS",
  },
  routeCities: ["CHENNAI", "PONDICHÉRY", "VELANKANNI", "MADURAI", "PERIYAR", "KUMARAKOM", "KOCHI", "GOA", "BOMBAY"],
  flightLegs: [],
  highlights: [
    "Sur les pas de l'apôtre saint Thomas : le tombeau de l'apôtre à la basilique San Thomé et le lieu de son martyre au Mont-Saint-Thomas, avec la « Croix de sang », à Chennai.",
    "Pondichéry, le charme d'un comptoir français : flânerie dans la Ville Blanche aux rues fleuries de bougainvilliers, basilique du Sacré-Cœur et ashram de Sri Aurobindo.",
    "Deux chefs-d'œuvre classés à l'UNESCO : le temple de Brihadishvara à Tanjore et l'éblouissante cité sacrée de Meenakshi à Madurai et ses gopurams polychromes.",
    "Fort Kochi, carrefour des mondes : palais hollandais de Mattancherry, église Saint-François où fut inhumé Vasco de Gama, carrelets de pêche chinois au couchant.",
    "Bombay en apothéose : Porte de l'Inde, Marine Drive, gare Chhatrapati Shivaji et l'église afghane pour conclure le voyage.",
  ],
  days: [
    {
      dayLabel: "JOUR 1",
      date: "DIM. 11 AVRIL 2027",
      title: "Arrivée à Chennai",
      city: "CHENNAI",
      leg: { text: "15 kms – 45 mins", fromCity: "Chennai International Airport", toCity: "Green Park Chennai" },
      hotel: { name: "Green Park Chennai", url: "https://hotelgreenpark.com/hotel-greenpark-chennai/" },
      intro:
        "Porte d'entrée du Sud de l'Inde, Chennai conjugue l'héritage colonial britannique, la ferveur de ses temples dravidiens et une vie culturelle d'une grande richesse. Capitale du Tamil Nadu, elle constitue un point de départ idéal pour votre voyage entre patrimoine chrétien et trésors de l'Inde du Sud.",
      sights: [],
      activities: [],
      closing: "Nuit à l'hôtel.",
    },
    {
      dayLabel: "JOUR 2",
      date: "LUN. 12 AVRIL 2027",
      title: "Visite de Chennai",
      city: "CHENNAI",
      hotel: { name: "Green Park Chennai", url: "https://hotelgreenpark.com/hotel-greenpark-chennai/" },
      intro: "Petit-déjeuner à l'hôtel, puis journée consacrée à la découverte de Chennai.",
      sights: [
        {
          title: "Basilique San Thomé – sur les pas de l'apôtre Thomas",
          description:
            "Édifiée au-dessus du tombeau de l'apôtre saint Thomas, venu évangéliser l'Inde au Ier siècle, la basilique San Thomé est l'un des trois seuls sanctuaires au monde construits sur la sépulture d'un apôtre du Christ. Reconstruite par les Britanniques en 1893 dans un élégant style néo-gothique, cette église d'un blanc éclatant abrite une crypte émouvante et un petit musée consacré à la vie de l'apôtre.",
        },
        {
          title: "Église Notre-Dame-de-la-Lumière (Luz Church)",
          description:
            "Fondée par les Franciscains portugais en 1516 et considérée comme la plus ancienne église de Chennai. Son architecture mêle styles portugais, gothique et baroque, et son intérieur orné de retables dorés en fait un lieu de dévotion mariale particulièrement émouvant.",
        },
      ],
      activities: [],
      closing: "Dîner et nuit à l'hôtel.",
    },
    {
      dayLabel: "JOUR 3",
      date: "MAR. 13 AVRIL 2027",
      title: "Chennai – Pondichéry",
      city: "PONDICHÉRY",
      leg: { text: "160 kms – 3 hrs 30", fromCity: "Chennai", toCity: "Puducherry" },
      hotel: { name: "The Residency Towers Puducherry", url: "https://www.theresidency.com/towers-puducherry/" },
      intro:
        "Après le petit-déjeuner, départ par la route côtière (East Coast Road) en direction de Pondichéry, ancien comptoir français des Indes.",
      sights: [
        {
          title: "En route : Mahabalipuram (Mamallapuram)",
          description:
            "Inscrit au patrimoine mondial de l'UNESCO, Mahabalipuram est l'un des hauts lieux de l'art pallava (VIIe–VIIIe siècles), sculpté directement dans le granit rose au bord de l'océan Indien : le Temple du Rivage, la Descente du Gange et les Cinq Rathas.",
        },
        {
          title: "La Ville Blanche – l'héritage français",
          description:
            "Balade en rickshaw dans la Ville Blanche, où les rues portent encore des noms français : rue Dumas, rue Romain-Rolland, rue Suffren… Villas coloniales aux façades ocre et bougainvilliers, hôtel de ville, statue de Dupleix et front de mer offrent une atmosphère unique.",
        },
      ],
      activities: [],
      closing: "Dîner et nuit à l'hôtel.",
    },
  ],
};
