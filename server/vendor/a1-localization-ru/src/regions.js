"use strict";

// Субъекты Российской Федерации — federal subjects of Russia, keyed on the
// ISO 3166-2:RU codes. Pure, dependency-free.
//
// Why the ISO 3166-2:RU standard set (and ONLY it): ISO codes are stable, neutral,
// internationally-recognized identifiers. Encoding exactly this set (83 entries) gives
// downstream systems a fixed, machine-checkable key space and deliberately avoids the
// territorial-claim ambiguity that arises from subjects not recognized in the
// international standard. Subdivision `type` uses the Russian constitutional vocabulary:
//   республика | край | область | город федерального значения |
//   автономная область | автономный округ.
//
// Mirrors the AM sibling (src/armeniaRegions.js): same exported names and shapes,
// but keyed on ISO 3166-2:RU instead of ISO 3166-2:AM.

// deepFreeze — freeze the array, each region object, and its nested cities array, so the
// exported data is deeply immutable (callers cannot mutate the shared dictionary).
function deepFreeze(regions) {
  for (const r of regions) {
    Object.freeze(r.cities);
    Object.freeze(r);
  }
  return Object.freeze(regions);
}

const REGIONS = deepFreeze([
  // --- Города федерального значения (cities of federal significance) ---
  { code: "RU-MOW", ru: "Москва", en: "Moscow", type: "город федерального значения", center: "Москва", cities: ["Москва", "Зеленоград", "Троицк"] },
  { code: "RU-SPE", ru: "Санкт-Петербург", en: "Saint Petersburg", type: "город федерального значения", center: "Санкт-Петербург", cities: ["Санкт-Петербург", "Колпино", "Пушкин", "Кронштадт"] },

  // --- Республики (republics) ---
  { code: "RU-AD", ru: "Республика Адыгея", en: "Adygea", type: "республика", center: "Майкоп", cities: ["Майкоп", "Адыгейск"] },
  { code: "RU-AL", ru: "Республика Алтай", en: "Altai Republic", type: "республика", center: "Горно-Алтайск", cities: ["Горно-Алтайск"] },
  { code: "RU-BA", ru: "Республика Башкортостан", en: "Bashkortostan", type: "республика", center: "Уфа", cities: ["Уфа", "Стерлитамак", "Салават", "Нефтекамск"] },
  { code: "RU-BU", ru: "Республика Бурятия", en: "Buryatia", type: "республика", center: "Улан-Удэ", cities: ["Улан-Удэ", "Северобайкальск"] },
  { code: "RU-CE", ru: "Чеченская Республика", en: "Chechnya", type: "республика", center: "Грозный", cities: ["Грозный", "Гудермес", "Урус-Мартан", "Шали"] },
  { code: "RU-CU", ru: "Чувашская Республика", en: "Chuvashia", type: "республика", center: "Чебоксары", cities: ["Чебоксары", "Новочебоксарск", "Канаш"] },
  { code: "RU-DA", ru: "Республика Дагестан", en: "Dagestan", type: "республика", center: "Махачкала", cities: ["Махачкала", "Хасавюрт", "Дербент", "Каспийск"] },
  { code: "RU-IN", ru: "Республика Ингушетия", en: "Ingushetia", type: "республика", center: "Магас", cities: ["Магас", "Назрань", "Карабулак"] },
  { code: "RU-KB", ru: "Кабардино-Балкарская Республика", en: "Kabardino-Balkaria", type: "республика", center: "Нальчик", cities: ["Нальчик", "Прохладный", "Баксан"] },
  { code: "RU-KC", ru: "Карачаево-Черкесская Республика", en: "Karachay-Cherkessia", type: "республика", center: "Черкесск", cities: ["Черкесск", "Усть-Джегута"] },
  { code: "RU-KL", ru: "Республика Калмыкия", en: "Kalmykia", type: "республика", center: "Элиста", cities: ["Элиста", "Городовиковск", "Лагань"] },
  { code: "RU-KR", ru: "Республика Карелия", en: "Karelia", type: "республика", center: "Петрозаводск", cities: ["Петрозаводск", "Кондопога", "Сегежа", "Костомукша"] },
  { code: "RU-KO", ru: "Республика Коми", en: "Komi", type: "республика", center: "Сыктывкар", cities: ["Сыктывкар", "Ухта", "Воркута", "Печора"] },
  { code: "RU-ME", ru: "Республика Марий Эл", en: "Mari El", type: "республика", center: "Йошкар-Ола", cities: ["Йошкар-Ола", "Волжск", "Козьмодемьянск"] },
  { code: "RU-MO", ru: "Республика Мордовия", en: "Mordovia", type: "республика", center: "Саранск", cities: ["Саранск", "Рузаевка", "Ковылкино"] },
  { code: "RU-SA", ru: "Республика Саха (Якутия)", en: "Sakha (Yakutia)", type: "республика", center: "Якутск", cities: ["Якутск", "Нерюнгри", "Мирный"] },
  { code: "RU-SE", ru: "Республика Северная Осетия — Алания", en: "North Ossetia–Alania", type: "республика", center: "Владикавказ", cities: ["Владикавказ", "Моздок", "Беслан"] },
  { code: "RU-TA", ru: "Республика Татарстан", en: "Tatarstan", type: "республика", center: "Казань", cities: ["Казань", "Набережные Челны", "Нижнекамск", "Альметьевск"] },
  { code: "RU-TY", ru: "Республика Тыва", en: "Tuva", type: "республика", center: "Кызыл", cities: ["Кызыл", "Ак-Довурак"] },
  { code: "RU-UD", ru: "Удмуртская Республика", en: "Udmurtia", type: "республика", center: "Ижевск", cities: ["Ижевск", "Сарапул", "Воткинск", "Глазов"] },
  { code: "RU-KK", ru: "Республика Хакасия", en: "Khakassia", type: "республика", center: "Абакан", cities: ["Абакан", "Черногорск", "Саяногорск"] },

  // --- Края (krais) ---
  { code: "RU-ALT", ru: "Алтайский край", en: "Altai Krai", type: "край", center: "Барнаул", cities: ["Барнаул", "Бийск", "Рубцовск", "Новоалтайск"] },
  { code: "RU-ZAB", ru: "Забайкальский край", en: "Zabaykalsky Krai", type: "край", center: "Чита", cities: ["Чита", "Краснокаменск", "Борзя"] },
  { code: "RU-KAM", ru: "Камчатский край", en: "Kamchatka Krai", type: "край", center: "Петропавловск-Камчатский", cities: ["Петропавловск-Камчатский", "Елизово", "Вилючинск"] },
  { code: "RU-KDA", ru: "Краснодарский край", en: "Krasnodar Krai", type: "край", center: "Краснодар", cities: ["Краснодар", "Сочи", "Новороссийск", "Армавир"] },
  { code: "RU-KYA", ru: "Красноярский край", en: "Krasnoyarsk Krai", type: "край", center: "Красноярск", cities: ["Красноярск", "Норильск", "Ачинск", "Канск"] },
  { code: "RU-PER", ru: "Пермский край", en: "Perm Krai", type: "край", center: "Пермь", cities: ["Пермь", "Березники", "Соликамск", "Чайковский"] },
  { code: "RU-PRI", ru: "Приморский край", en: "Primorsky Krai", type: "край", center: "Владивосток", cities: ["Владивосток", "Уссурийск", "Находка", "Артём"] },
  { code: "RU-STA", ru: "Ставропольский край", en: "Stavropol Krai", type: "край", center: "Ставрополь", cities: ["Ставрополь", "Пятигорск", "Кисловодск", "Невинномысск"] },
  { code: "RU-KHA", ru: "Хабаровский край", en: "Khabarovsk Krai", type: "край", center: "Хабаровск", cities: ["Хабаровск", "Комсомольск-на-Амуре", "Амурск"] },

  // --- Области (oblasts) ---
  { code: "RU-AMU", ru: "Амурская область", en: "Amur Oblast", type: "область", center: "Благовещенск", cities: ["Благовещенск", "Белогорск", "Свободный", "Тында"] },
  { code: "RU-ARK", ru: "Архангельская область", en: "Arkhangelsk Oblast", type: "область", center: "Архангельск", cities: ["Архангельск", "Северодвинск", "Котлас"] },
  { code: "RU-AST", ru: "Астраханская область", en: "Astrakhan Oblast", type: "область", center: "Астрахань", cities: ["Астрахань", "Ахтубинск", "Знаменск"] },
  { code: "RU-BEL", ru: "Белгородская область", en: "Belgorod Oblast", type: "область", center: "Белгород", cities: ["Белгород", "Старый Оскол", "Губкин"] },
  { code: "RU-BRY", ru: "Брянская область", en: "Bryansk Oblast", type: "область", center: "Брянск", cities: ["Брянск", "Клинцы", "Новозыбков"] },
  { code: "RU-VLA", ru: "Владимирская область", en: "Vladimir Oblast", type: "область", center: "Владимир", cities: ["Владимир", "Ковров", "Муром", "Александров"] },
  { code: "RU-VGG", ru: "Волгоградская область", en: "Volgograd Oblast", type: "область", center: "Волгоград", cities: ["Волгоград", "Волжский", "Камышин"] },
  { code: "RU-VLG", ru: "Вологодская область", en: "Vologda Oblast", type: "область", center: "Вологда", cities: ["Вологда", "Череповец", "Сокол"] },
  { code: "RU-VOR", ru: "Воронежская область", en: "Voronezh Oblast", type: "область", center: "Воронеж", cities: ["Воронеж", "Россошь", "Лиски", "Борисоглебск"] },
  { code: "RU-IVA", ru: "Ивановская область", en: "Ivanovo Oblast", type: "область", center: "Иваново", cities: ["Иваново", "Кинешма", "Шуя"] },
  { code: "RU-IRK", ru: "Иркутская область", en: "Irkutsk Oblast", type: "область", center: "Иркутск", cities: ["Иркутск", "Братск", "Ангарск", "Усть-Илимск"] },
  { code: "RU-KGD", ru: "Калининградская область", en: "Kaliningrad Oblast", type: "область", center: "Калининград", cities: ["Калининград", "Советск", "Черняховск"] },
  { code: "RU-KLU", ru: "Калужская область", en: "Kaluga Oblast", type: "область", center: "Калуга", cities: ["Калуга", "Обнинск", "Людиново"] },
  { code: "RU-KEM", ru: "Кемеровская область — Кузбасс", en: "Kemerovo Oblast", type: "область", center: "Кемерово", cities: ["Кемерово", "Новокузнецк", "Прокопьевск", "Ленинск-Кузнецкий"] },
  { code: "RU-KIR", ru: "Кировская область", en: "Kirov Oblast", type: "область", center: "Киров", cities: ["Киров", "Кирово-Чепецк", "Слободской"] },
  { code: "RU-KOS", ru: "Костромская область", en: "Kostroma Oblast", type: "область", center: "Кострома", cities: ["Кострома", "Буй", "Шарья"] },
  { code: "RU-KGN", ru: "Курганская область", en: "Kurgan Oblast", type: "область", center: "Курган", cities: ["Курган", "Шадринск"] },
  { code: "RU-KRS", ru: "Курская область", en: "Kursk Oblast", type: "область", center: "Курск", cities: ["Курск", "Железногорск", "Курчатов"] },
  { code: "RU-LEN", ru: "Ленинградская область", en: "Leningrad Oblast", type: "область", center: "Гатчина", cities: ["Гатчина", "Выборг", "Всеволожск", "Тихвин"] },
  { code: "RU-LIP", ru: "Липецкая область", en: "Lipetsk Oblast", type: "область", center: "Липецк", cities: ["Липецк", "Елец", "Грязи"] },
  { code: "RU-MAG", ru: "Магаданская область", en: "Magadan Oblast", type: "область", center: "Магадан", cities: ["Магадан", "Сусуман"] },
  { code: "RU-MOS", ru: "Московская область", en: "Moscow Oblast", type: "область", center: "Красногорск", cities: ["Красногорск", "Балашиха", "Подольск", "Химки", "Мытищи"] },
  { code: "RU-MUR", ru: "Мурманская область", en: "Murmansk Oblast", type: "область", center: "Мурманск", cities: ["Мурманск", "Апатиты", "Североморск", "Мончегорск"] },
  { code: "RU-NIZ", ru: "Нижегородская область", en: "Nizhny Novgorod Oblast", type: "область", center: "Нижний Новгород", cities: ["Нижний Новгород", "Дзержинск", "Арзамас", "Саров"] },
  { code: "RU-NGR", ru: "Новгородская область", en: "Novgorod Oblast", type: "область", center: "Великий Новгород", cities: ["Великий Новгород", "Боровичи", "Старая Русса"] },
  { code: "RU-NVS", ru: "Новосибирская область", en: "Novosibirsk Oblast", type: "область", center: "Новосибирск", cities: ["Новосибирск", "Бердск", "Искитим"] },
  { code: "RU-OMS", ru: "Омская область", en: "Omsk Oblast", type: "область", center: "Омск", cities: ["Омск", "Тара", "Исилькуль"] },
  { code: "RU-ORE", ru: "Оренбургская область", en: "Orenburg Oblast", type: "область", center: "Оренбург", cities: ["Оренбург", "Орск", "Новотроицк", "Бузулук"] },
  { code: "RU-ORL", ru: "Орловская область", en: "Oryol Oblast", type: "область", center: "Орёл", cities: ["Орёл", "Ливны", "Мценск"] },
  { code: "RU-PNZ", ru: "Пензенская область", en: "Penza Oblast", type: "область", center: "Пенза", cities: ["Пенза", "Кузнецк", "Заречный"] },
  { code: "RU-PSK", ru: "Псковская область", en: "Pskov Oblast", type: "область", center: "Псков", cities: ["Псков", "Великие Луки"] },
  { code: "RU-ROS", ru: "Ростовская область", en: "Rostov Oblast", type: "область", center: "Ростов-на-Дону", cities: ["Ростов-на-Дону", "Таганрог", "Шахты", "Волгодонск"] },
  { code: "RU-RYA", ru: "Рязанская область", en: "Ryazan Oblast", type: "область", center: "Рязань", cities: ["Рязань", "Касимов", "Скопин"] },
  { code: "RU-SAM", ru: "Самарская область", en: "Samara Oblast", type: "область", center: "Самара", cities: ["Самара", "Тольятти", "Сызрань", "Новокуйбышевск"] },
  { code: "RU-SAR", ru: "Саратовская область", en: "Saratov Oblast", type: "область", center: "Саратов", cities: ["Саратов", "Энгельс", "Балаково", "Балашов"] },
  { code: "RU-SAK", ru: "Сахалинская область", en: "Sakhalin Oblast", type: "область", center: "Южно-Сахалинск", cities: ["Южно-Сахалинск", "Корсаков", "Холмск"] },
  { code: "RU-SVE", ru: "Свердловская область", en: "Sverdlovsk Oblast", type: "область", center: "Екатеринбург", cities: ["Екатеринбург", "Нижний Тагил", "Каменск-Уральский", "Первоуральск"] },
  { code: "RU-SMO", ru: "Смоленская область", en: "Smolensk Oblast", type: "область", center: "Смоленск", cities: ["Смоленск", "Вязьма", "Рославль"] },
  { code: "RU-TAM", ru: "Тамбовская область", en: "Tambov Oblast", type: "область", center: "Тамбов", cities: ["Тамбов", "Мичуринск", "Моршанск"] },
  { code: "RU-TVE", ru: "Тверская область", en: "Tver Oblast", type: "область", center: "Тверь", cities: ["Тверь", "Ржев", "Вышний Волочёк"] },
  { code: "RU-TOM", ru: "Томская область", en: "Tomsk Oblast", type: "область", center: "Томск", cities: ["Томск", "Северск", "Стрежевой"] },
  { code: "RU-TUL", ru: "Тульская область", en: "Tula Oblast", type: "область", center: "Тула", cities: ["Тула", "Новомосковск", "Алексин", "Щёкино"] },
  { code: "RU-TYU", ru: "Тюменская область", en: "Tyumen Oblast", type: "область", center: "Тюмень", cities: ["Тюмень", "Тобольск", "Ишим"] },
  { code: "RU-ULY", ru: "Ульяновская область", en: "Ulyanovsk Oblast", type: "область", center: "Ульяновск", cities: ["Ульяновск", "Димитровград", "Барыш"] },
  { code: "RU-CHE", ru: "Челябинская область", en: "Chelyabinsk Oblast", type: "область", center: "Челябинск", cities: ["Челябинск", "Магнитогорск", "Златоуст", "Миасс"] },
  { code: "RU-YAR", ru: "Ярославская область", en: "Yaroslavl Oblast", type: "область", center: "Ярославль", cities: ["Ярославль", "Рыбинск", "Тутаев", "Переславль-Залесский"] },

  // --- Автономная область (autonomous oblast) ---
  { code: "RU-YEV", ru: "Еврейская автономная область", en: "Jewish Autonomous Oblast", type: "автономная область", center: "Биробиджан", cities: ["Биробиджан", "Облучье"] },

  // --- Автономные округа (autonomous okrugs) ---
  { code: "RU-CHU", ru: "Чукотский автономный округ", en: "Chukotka Autonomous Okrug", type: "автономный округ", center: "Анадырь", cities: ["Анадырь", "Билибино", "Певек"] },
  { code: "RU-KHM", ru: "Ханты-Мансийский автономный округ — Югра", en: "Khanty-Mansi Autonomous Okrug – Yugra", type: "автономный округ", center: "Ханты-Мансийск", cities: ["Ханты-Мансийск", "Сургут", "Нижневартовск", "Нефтеюганск"] },
  { code: "RU-YAN", ru: "Ямало-Ненецкий автономный округ", en: "Yamalo-Nenets Autonomous Okrug", type: "автономный округ", center: "Салехард", cities: ["Салехард", "Новый Уренгой", "Ноябрьск", "Надым"] },
  { code: "RU-NEN", ru: "Ненецкий автономный округ", en: "Nenets Autonomous Okrug", type: "автономный округ", center: "Нарьян-Мар", cities: ["Нарьян-Мар"] },
]);

const REGION_CODES = Object.freeze(REGIONS.map((r) => r.code));

// Lookup index (built once, not exported): UPPERCASE code → region.
const BY_CODE = new Map(REGIONS.map((r) => [r.code, r]));
// Name index: lowercased ru / en name → region (for findRegion).
const BY_NAME = new Map();
for (const r of REGIONS) {
  BY_NAME.set(r.ru.toLowerCase(), r);
  BY_NAME.set(r.en.toLowerCase(), r);
}

// Normalize a code-ish input to a canonical ISO 3166-2:RU code: trims, uppercases.
// Returns null for non-string / empty input.
function normalizeCode(code) {
  if (typeof code !== "string") return null;
  const s = code.trim().toUpperCase();
  return s === "" ? null : s;
}

// regionByCode — case-insensitive, trims; returns the frozen region or null on miss.
function regionByCode(code) {
  const c = normalizeCode(code);
  if (c === null) return null;
  return BY_CODE.get(c) || null;
}

// isValidRegionCode — true iff `code` resolves to a known ISO 3166-2:RU subject.
function isValidRegionCode(code) {
  return regionByCode(code) !== null;
}

// findRegion — resolve by ISO code OR exact ru/en name (all case-insensitive, trimmed).
// Returns the frozen region or null.
function findRegion(query) {
  if (typeof query !== "string") return null;
  const q = query.trim();
  if (q === "") return null;
  const byCode = BY_CODE.get(q.toUpperCase());
  if (byCode) return byCode;
  return BY_NAME.get(q.toLowerCase()) || null;
}

// citiesForRegion — returns a COPY of the region's cities (centre first), or [] on miss.
// Mutating the returned array does not affect the frozen REGIONS data.
function citiesForRegion(code) {
  const r = regionByCode(code);
  return r ? r.cities.slice() : [];
}

module.exports = {
  REGIONS,
  REGION_CODES,
  regionByCode,
  isValidRegionCode,
  findRegion,
  citiesForRegion,
};
