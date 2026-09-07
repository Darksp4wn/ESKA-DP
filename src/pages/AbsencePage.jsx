import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const absenceTypes = [
  { value: 'urlaub', label: 'Urlaub' },
  { value: 'krankheit', label: 'Krankheit' },
  { value: 'sonderurlaub', label: 'Sonderurlaub' },
  { value: 'fortbildung', label: 'Fortbildung' },
  { value: 'unbezahlt', label: 'Unbezahlte Abwesenheit' },
  { value: 'sonstige', label: 'Sonstige Abwesenheit' }
];

function calculateDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;

  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);

  if (end < start) return 0;

  let days = 0;
  const current = new Date(start);

  while (current <= end) {
    const weekday = current.getDay();

    // Sonntag wird nicht als Urlaubstag gezählt
    if (weekday !== 0) {
      days += 1;
    }

    current.setDate(current.getDate() + 1);
  }

  return days;
}

function formatDate(date) {
  if (!date) return '–';

  return new Date(`${date}T12:00:00`).toLocaleDateString('de-DE');
}

function getTypeLabel(type) {
  return absenceTypes.find((item) => item.value === type)?.label || type;
}

export default function AbsencePage() {
  const [employees, setEmployees] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError('');

    const [employeesResult, absencesResult] = await Promise.all([
      supabase
        .from('employees')
        .select('id, first_name, last_name, vacation_entitlement')
        .eq('is_active', true)
        .order('last_name'),

      supabase
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
            last_name,
            vacation_entitlement
          )
        `)
        .order('start_date', { ascending: false })
    ]);

    if (employeesResult.error) {
      setError(`Mitarbeiter konnten nicht geladen werden: ${employeesResult.error.message}`);
    } else {
      setEmployees(employeesResult.data || []);
    }

    if (absencesResult.error) {
      setError(`Abwesenheiten konnten nicht geladen werden: ${absencesResult.error.message}`);
    } else {
      setAbsences(absencesResult.data || []);
    }

    setLoading(false);
  }

  async function saveAbsence(formData) {
    setSaving(true);
    setError('');
    setMessage('');

    const days = calculateDays(formData.start_date, formData.end_date);

    if (days <= 0) {
      setError('Der Zeitraum ist ungültig.');
      setSaving(false);
      return;
    }

    const { error: saveError } = await supabase
      .from('absences')
      .insert({
        employee_id: formData.employee_id,
        absence_type: formData.absence_type,
        start_date: formData.start_date,
        end_date: formData.end_date,
        days,
        note: formData.note.trim() || null
      });

    if (saveError) {
      setError(`Abwesenheit konnte nicht gespeichert werden: ${saveError.message}`);
      setSaving(false);
      return;
    }

    setMessage('Abwesenheit wurde erfolgreich eingetragen.');
    setShowForm(false);
    setSaving(false);
    await loadData();
  }

  async function deleteAbsence(id) {
    if (!window.confirm('Soll dieser Eintrag wirklich gelöscht werden?')) {
      return;
    }

    const { error: deleteError } = await supabase
      .from('absences')
      .delete()
      .eq('id', id);

    if (deleteError) {
      setError(`Eintrag konnte nicht gelöscht werden: ${deleteError.message}`);
      return;
    }

    setMessage('Eintrag wurde gelöscht.');
    await loadData();
  }

  return (
    <>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Abwesenheiten</p>
          <h2>Urlaub & Abwesenheit</h2>
          <p className="muted">
            Urlaub und sonstige Abwesenheiten manuell verwalten.
          </p>
        </div>

        <button
          className="primary-button compact"
          onClick={() => {
            setError('');
            setMessage('');
            setShowForm(true);
          }}
        >
          + Abwesenheit eintragen
        </button>
      </div>

      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message page-message">{error}</div>}

      <section className="content-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Übersicht</p>
            <h3>Abwesenheiten</h3>
          </div>

          <button className="secondary-button" onClick={loadData}>
            Aktualisieren
          </button>
        </div>

        {loading && (
          <div className="loading-inline">
            Abwesenheiten werden geladen …
          </div>
        )}

        {!loading && absences.length === 0 && (
          <div className="empty-state compact-empty">
            <div className="empty-icon">◫</div>
            <strong>Noch keine Abwesenheiten eingetragen</strong>
            <span>
              Über die Schaltfläche oben können Sie den ersten Eintrag anlegen.
            </span>
          </div>
        )}

        {!loading && absences.length > 0 && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Mitarbeiter</th>
                  <th>Art</th>
                  <th>Von</th>
                  <th>Bis</th>
                  <th>Tage</th>
                  <th>Bemerkung</th>
                  <th>Aktion</th>
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
                    <td>{getTypeLabel(absence.absence_type)}</td>
                    <td>{formatDate(absence.start_date)}</td>
                    <td>{formatDate(absence.end_date)}</td>
                    <td>{absence.days}</td>
                    <td>{absence.note || '–'}</td>
                    <td>
                      <button
                        className="delete-button"
                        onClick={() => deleteAbsence(absence.id)}
                      >
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showForm && (
        <AbsenceFormModal
          employees={employees}
          saving={saving}
          onClose={() => setShowForm(false)}
          onSubmit={saveAbsence}
        />
      )}
    </>
  );
}

function AbsenceFormModal({ employees, saving, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    employee_id: '',
    absence_type: 'urlaub',
    start_date: '',
    end_date: '',
    note: ''
  });

  const [formError, setFormError] = useState('');

  const calculatedDays = calculateDays(
    formData.start_date,
    formData.end_date
  );

  function updateField(event) {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setFormError('');

    if (!formData.employee_id) {
      setFormError('Bitte wählen Sie einen Mitarbeiter aus.');
      return;
    }

    if (!formData.start_date || !formData.end_date) {
      setFormError('Bitte wählen Sie Beginn und Ende aus.');
      return;
    }

    if (calculatedDays <= 0) {
      setFormError('Der Zeitraum ist ungültig.');
      return;
    }

    await onSubmit(formData);
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card employee-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Abwesenheitsverwaltung</p>
            <h3>Abwesenheit eintragen</h3>
          </div>

          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="form-section">
            <div className="form-grid">
              <label>
                Mitarbeiter *
                <select
                  name="employee_id"
                  value={formData.employee_id}
                  onChange={updateField}
                  required
                >
                  <option value="">Bitte auswählen</option>

                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.last_name}, {employee.first_name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Art der Abwesenheit
                <select
                  name="absence_type"
                  value={formData.absence_type}
                  onChange={updateField}
                >
                  {absenceTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Beginn *
                <input
                  type="date"
                  name="start_date"
                  value={formData.start_date}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                Ende *
                <input
                  type="date"
                  name="end_date"
                  value={formData.end_date}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                Berechnete Tage
                <input value={calculatedDays} readOnly />
              </label>

              <label>
                Bemerkung
                <input
                  name="note"
                  value={formData.note}
                  onChange={updateField}
                  placeholder="Optional"
                />
              </label>
            </div>
          </div>

          <p className="form-help">
            Sonntage werden automatisch nicht als Urlaubstage gezählt.
            Feiertage werden in einer späteren Erweiterung berücksichtigt.
          </p>

          {formError && <div className="error-message">{formError}</div>}

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={saving}
            >
              Abbrechen
            </button>

            <button
              type="submit"
              className="primary-button"
              disabled={saving}
            >
              {saving ? 'Speichern …' : 'Eintragen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
