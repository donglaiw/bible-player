/* A reading is six chapters; Psalms and Proverbs cycle independently. */
(function (root) {
  function reading(day) {
    if (!Number.isInteger(day) || day < 0) throw new Error('Invalid reading day');
    return [...Array.from({length: 5}, (_, i) => ({book: 'Psalms', chapter: (day * 5 + i) % 150 + 1})),
      {book: 'Proverbs', chapter: day % 31 + 1}];
  }
  function dateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }
  function calendarDay(start, today = dateKey()) {
    return Math.max(0, Math.floor((Date.parse(today+'T00:00:00Z') - Date.parse(start+'T00:00:00Z')) / 86400000));
  }
  const canon = [['Genesis',50],['Exodus',40],['Leviticus',27],['Numbers',36],['Deuteronomy',34],['Joshua',24],['Judges',21],['Ruth',4],['1 Samuel',31],['2 Samuel',24],['1 Kings',22],['2 Kings',25],['1 Chronicles',29],['2 Chronicles',36],['Ezra',10],['Nehemiah',13],['Esther',10],['Job',42],['Psalms',150],['Proverbs',31],['Ecclesiastes',12],['Song of Solomon',8],['Isaiah',66],['Jeremiah',52],['Lamentations',5],['Ezekiel',48],['Daniel',12],['Hosea',14],['Joel',3],['Amos',9],['Obadiah',1],['Jonah',4],['Micah',7],['Nahum',3],['Habakkuk',3],['Zephaniah',3],['Haggai',2],['Zechariah',14],['Malachi',4],['Matthew',28],['Mark',16],['Luke',24],['John',21],['Acts',28],['Romans',16],['1 Corinthians',16],['2 Corinthians',13],['Galatians',6],['Ephesians',6],['Philippians',4],['Colossians',4],['1 Thessalonians',5],['2 Thessalonians',3],['1 Timothy',6],['2 Timothy',4],['Titus',3],['Philemon',1],['Hebrews',13],['James',5],['1 Peter',5],['2 Peter',3],['1 John',5],['2 John',1],['3 John',1],['Jude',1],['Revelation',22]];
  const chapters = canon.flatMap(([book, count]) => Array.from({length:count}, (_,i) => ({book,chapter:i+1})));
  function annual(day) {
    const index = day % 365;
    return chapters.slice(Math.floor(index*chapters.length/365), Math.floor((index+1)*chapters.length/365));
  }
  function monthly(date = new Date()) {
    const days = new Date(date.getFullYear(),date.getMonth()+1,0).getDate();
    const day = date.getDate()-1;
    return [['Psalms',150],['Proverbs',31]].flatMap(([book,count]) => {
      const first = Math.floor(day*count/days), end = Math.floor((day+1)*count/days);
      return Array.from({length:end-first}, (_,i) => ({book, chapter:first+i+1}));
    });
  }
  const api = {reading, dateKey, calendarDay, annual, monthly, canon};
  if (typeof module !== 'undefined') module.exports = api;
  root.Plan = api;
})(globalThis);
