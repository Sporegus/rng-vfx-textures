// Weather from Open-Meteo (free, no account or key). Zin only sends the name
// of the city you tell her, never your exact location.
const CODES = {
  0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'cloudy', 45: 'foggy', 48: 'foggy',
  51: 'drizzly', 53: 'drizzly', 55: 'drizzly', 56: 'freezing drizzle', 57: 'freezing drizzle',
  61: 'light rain', 63: 'rainy', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain',
  71: 'light snow', 73: 'snowy', 75: 'heavy snow', 77: 'snowy', 80: 'showers', 81: 'showers', 82: 'heavy showers',
  85: 'snow showers', 86: 'snow showers', 95: 'stormy', 96: 'stormy with hail', 99: 'stormy with hail',
};
const ICON = (c) => c === 0 || c === 1 ? '☀️' : c <= 3 ? '⛅' : c <= 48 ? '🌫️' : c <= 67 || (c >= 80 && c <= 82) ? '🌧️' : c <= 86 ? '❄️' : '⛈️';

async function getJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('The weather service didn\'t answer.');
  return r.json();
}

// place: a city name. fahrenheit: true for °F. Returns a short summary she can say.
async function get({ place, fahrenheit }) {
  if (!place) return { needCity: true };
  const geo = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(place)}`);
  const g = geo.results && geo.results[0];
  if (!g) return { notFound: place };
  const unit = fahrenheit ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '';
  const w = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&timezone=auto&forecast_days=4${unit}` +
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  const d = w.daily;
  const days = d.time.map((t, i) => ({ date: t, code: d.weather_code[i], sky: CODES[d.weather_code[i]] || 'mixed', icon: ICON(d.weather_code[i]),
    high: Math.round(d.temperature_2m_max[i]), low: Math.round(d.temperature_2m_min[i]), rain: d.precipitation_probability_max[i] }));
  const c = w.current;
  return {
    place: g.name + (g.admin1 && g.admin1 !== g.name ? ', ' + g.admin1 : ''), unit: fahrenheit ? '°F' : '°C',
    now: { temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), sky: CODES[c.weather_code] || 'mixed', icon: ICON(c.weather_code), wind: Math.round(c.wind_speed_10m) },
    days,
  };
}

// one or two sentences, for her to say
function summary(r, day = 0) {
  if (r.needCity) return 'Which city are you in?';
  if (r.notFound) return `I couldn't find a place called ${r.notFound}.`;
  const u = r.unit;
  if (day === 'week') return `Here's ${r.place}: ` + r.days.slice(0, 3).map((d, i) => `${i === 0 ? 'today' : i === 1 ? 'tomorrow' : new Date(d.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'long' })} ${d.sky}, ${d.high}${u}`).join('; ') + '.';
  const d = r.days[day] || r.days[0];
  const rain = d.rain >= 50 ? ` ${d.rain}% chance of rain, so bring an umbrella!` : d.rain >= 25 ? ` Maybe some rain (${d.rain}%).` : '';
  if (day === 1) return `Tomorrow in ${r.place}: ${d.sky}, high of ${d.high}${u} and low of ${d.low}${u}.${rain}`;
  return `It's ${r.now.temp}${u} and ${r.now.sky} in ${r.place}${Math.abs(r.now.feels - r.now.temp) >= 4 ? `, feels like ${r.now.feels}${u}` : ''}. Today's high is ${d.high}${u}.${rain}`;
}

module.exports = { get, summary };
