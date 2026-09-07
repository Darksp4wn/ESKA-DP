import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const typeLabels = {
  urlaub: 'Urlaub',
  krankheit: 'Krankheit',
  sonderurlaub: 'Sonderurlaub',
  fortbildung: 'Fortbildung',
  unbezahlt: 'Unbezahlt',
  sonstige: 'Sonstige'
};

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function getCalendarStart(date) {
  const first = startOfMonth(date);
  const weekday = first.getDay();
  const mondayOffset = weekday === 0 ? 6 : weekday - 1;

  return addDays(first, -mondayOffset);
}

function isBetween(date, start, end) {
  const current = dateKey(date);
  return current >= start && current <= end;
}

function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('de-DE');
}

export default function AbsenceCalendarPage() {
  const [month, setMonth] = useState(new Date());
  const [absences, setAbsences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const calendarDays = useMemo(() => {
    const start = getCalendarStart(month);

    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [month]);

  useEffect(() => {
    loadAbsences();
  }, [month]);

  async function loadAbsences() {
    setLoading(true);
    setError('');

    const firstDay = dateKey(calendarDays[0]);
    const lastDay = dateKey(calendarDays[calendarDays.length - 1]);

    const { data, error: loadError } = await supabase
      .from('absences')
      .select(`
        id,
        employee_id,
        absence_type,
        start_date,
        end_date,
        days,
        note,
        employee:employees (
          first_name,
          last_name
        )
      `)
      .lte('start_date', lastDay)
      .gte('end_date', firstDay)
      .order('start_date');

    if (loadError) {
      setError(`Abwesenheiten konnten nicht geladen werden: ${loadError.message}`);
    } else {
      setAbsences(data || []);
    }

    setLoading(false);
  }

  function previousMonth() {
    setMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12)
    );
  }

  function nextMonth() {
    setMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12)
    );
  }

  function today() {
    setMonth(new Date());
  }

  return (
    <>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Kalender</p>
          <h2>Abwesenheitskalender</h2>
          <p className="muted">
            Übersicht aller Urlaubstage und sonstigen Abwesenheiten.
          </p>
        </div>

        <div className="calendar-actions">
          <button className="secondary-button" onClick={previousMonth}>
            ←
          </button>

          <button className="secondary-button" onClick={today}>
            Heute
          </button>

          <button className="secondary-button" onClick={nextMonth}>
            →
          </button>
        </div>
      </div>

      {error && <div className="error-message page-message">{error}</div>}

      <section className="content-card absence-calendar-card">
        <div className="calendar-title">
          {month.toLocaleDateString('de-DE', {
            month: 'long',
            year: 'numeric'
          })}
        </div>

        <div className="calendar-weekdays">
          {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>

        {loading ? (
          <div className="loading-inline">
            Abwesenheiten werden geladen …
          </div>
        ) : (
          <div className="absence-calendar-grid">
            {calendarDays.map((day) => {
              const currentKey = dateKey(day);
              const inCurrentMonth =
                day.getMonth() === month.getMonth();

              const dayAbsences = absences.filter((absence) =>
                isBetween(day, absence.start_date, absence.end_date)
              );

              return (
                <div
                  key={currentKey}
                  className={
                    inCurrentMonth
                      ? 'absence-day'
                      : 'absence-day outside-month'
                  }
                >
                  <div className="absence-day-number">
                    {day.getDate()}
                  </div>

                  <div className="absence-events">
                    {dayAbsences.map((absence) => (
                      <div
                        key={absence.id}
                        className={`absence-event absence-${absence.absence_type}`}
                        title={`${absence.employee?.first_name || ''} ${absence.employee?.last_name || ''} – ${typeLabels[absence.absence_type] || absence.absence_type}`}
                      >
                        <strong>
                          {absence.employee?.last_name},{' '}
                          {absence.employee?.first_name?.[0]}.
                        </strong>
                        <span>
                          {typeLabels[absence.absence_type] ||
                            absence.absence_type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="content-card absence-list-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Monatsübersicht</p>
            <h3>Abwesenheiten in diesem Zeitraum</h3>
          </div>
        </div>

        {absences.length === 0 ? (
          <div className="empty-state compact-empty">
            <div className="empty-icon">◫</div>
            <strong>Keine Abwesenheiten</strong>
            <span>Für diesen Kalenderzeitraum gibt es keine Einträge.</span>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Mitarbeiter</th>
                  <th>Art</th>
                  <th>Zeitraum</th>
                  <th>Tage</th>
                </tr>
              </thead>

              <tbody>
                {absences.map((absence) => (
                  <tr key={absence.id}>
                    <td>
                      <strong>
                        {absence.employee?.first_name}{' '}
                        {absence.employee?.last_name}
                      </strong>
                    </td>
                    <td>
                      {typeLabels[absence.absence_type] ||
                        absence.absence_type}
                    </td>
                    <td>
                      {formatDate(absence.start_date)} –{' '}
                      {formatDate(absence.end_date)}
                    </td>
                    <td>{absence.days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
