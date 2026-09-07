import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const weekdayNames = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag'
];

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getMonday(date) {
  const result = new Date(date);
  const day = result.getDay();
  const difference = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + difference);
  result.setHours(12, 0, 0, 0);
  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDisplayDate(date) {
  return date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  });
}

function calculateMinutes(start, end, breakMinutes) {
  if (!start || !end) return 0;

  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);

  let minutes =
    endHour * 60 +
    endMinute -
    (startHour * 60 + startMinute);

  if (minutes < 0) {
    minutes += 24 * 60;
  }

  return Math.max(0, minutes - Number(breakMinutes || 0));
}

function formatHours(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}:${String(remainingMinutes).padStart(2, '0')} Std.`;
}

export default function SchedulePage() {
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [selectedDate, setSelectedDate] = useState(
    formatDate(new Date())
  );

  const [showForm, setShowForm] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState({
  type: 'all',
  id: null,
  name: 'Alle Bereiche'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const days = useMemo(() => {
    return Array.from({ length: 6 }, (_, index) => {
      return addDays(weekStart, index);
    });
  }, [weekStart]);

const selectedShifts = shifts.filter(
  (shift) => shift.plan_date === selectedDate
);

const visibleShifts =
  selectedGroup.type === 'all'
    ? selectedShifts
    : selectedShifts.filter((shift) => {
        if (selectedGroup.type === 'department') {
          return shift.department_id === selectedGroup.id;
        }

        if (selectedGroup.type === 'area') {
          return shift.assignment_area_id === selectedGroup.id;
        }

        return true;
      });

const departmentOverview = departments.map((department) => {
  const departmentShifts = selectedShifts.filter(
    (shift) => shift.department_id === department.id
  );

  const employeeIds = new Set(
    departmentShifts.map((shift) => shift.employee_id)
  );

  return {
    ...department,
    shiftCount: departmentShifts.length,
    employeeCount: employeeIds.size
  };
});

const areaOverview = areas.map((area) => {
  const areaShifts = selectedShifts.filter(
    (shift) => shift.assignment_area_id === area.id
  );

  const employeeIds = new Set(
    areaShifts.map((shift) => shift.employee_id)
  );

  return {
    ...area,
    shiftCount: areaShifts.length,
    employeeCount: employeeIds.size
  };
});

  useEffect(() => {
    loadMasterData();
  }, []);

  useEffect(() => {
    loadWeekShifts();
  }, [weekStart]);

  async function loadMasterData() {
    const [employeesResult, departmentsResult, areasResult] =
      await Promise.all([
        supabase
          .from('employees')
          .select(`
            id,
            first_name,
            last_name,
            personnel_number,
            employment_type,
            weekly_hours,
            employee_departments (
              department:departments (
                id,
                name
              )
            ),
            employee_assignment_areas (
              assignment_area:assignment_areas (
                id,
                name
              )
            )
          `)
          .eq('is_active', true)
          .order('last_name'),

        supabase
          .from('departments')
          .select('id, name')
          .eq('is_active', true)
          .order('name'),

        supabase
          .from('assignment_areas')
          .select('id, name')
          .eq('is_active', true)
          .order('name')
      ]);

    if (employeesResult.error) {
      setError(`Mitarbeiter konnten nicht geladen werden: ${employeesResult.error.message}`);
    } else {
      setEmployees(employeesResult.data || []);
    }

    setDepartments(departmentsResult.data || []);
    setAreas(areasResult.data || []);
    setLoading(false);
  }

  async function loadWeekShifts() {
    const startDate = formatDate(weekStart);
    const endDate = formatDate(addDays(weekStart, 5));

    const { data, error: shiftsError } = await supabase
      .from('schedule_plans')
      .select(`
        id,
        plan_date,
        shifts (
          id,
          employee_id,
          department_id,
          assignment_area_id,
          start_time,
          end_time,
          break_minutes,
          note,
          employee:employees (
            first_name,
            last_name
          ),
          department:departments (
            name
          ),
          assignment_area:assignment_areas (
            name
          )
        )
      `)
      .gte('plan_date', startDate)
      .lte('plan_date', endDate)
      .order('plan_date');

    if (shiftsError) {
      setError(`Dienstplan konnte nicht geladen werden: ${shiftsError.message}`);
      return;
    }

    const flattened = [];

    (data || []).forEach((plan) => {
      (plan.shifts || []).forEach((shift) => {
        flattened.push({
          ...shift,
          plan_date: plan.plan_date
        });
      });
    });

    setShifts(flattened);
  }

  function openNewShift(date) {
    setSelectedDate(formatDate(date));
    setMessage('');
    setError('');
    setShowForm(true);
  }

  async function saveShift(formData) {
    setSaving(true);
    setMessage('');
    setError('');

    let { data: plan, error: planError } = await supabase
      .from('schedule_plans')
      .select('id')
      .eq('plan_date', formData.plan_date)
      .maybeSingle();

    if (planError) {
      setError(`Tagesplan konnte nicht geladen werden: ${planError.message}`);
      setSaving(false);
      return;
    }

    if (!plan) {
      const result = await supabase
        .from('schedule_plans')
        .insert({
          plan_date: formData.plan_date,
          title: `Dienstplan ${formData.plan_date}`,
          status: 'entwurf'
        })
        .select('id')
        .single();

      if (result.error) {
        setError(`Tagesplan konnte nicht erstellt werden: ${result.error.message}`);
        setSaving(false);
        return;
      }

      plan = result.data;
    }

    const { error: shiftError } = await supabase
      .from('shifts')
      .insert({
        schedule_plan_id: plan.id,
        employee_id: formData.employee_id,
        department_id: formData.department_id || null,
        assignment_area_id: formData.assignment_area_id || null,
        start_time: formData.start_time,
        end_time: formData.end_time,
        break_minutes: Number(formData.break_minutes || 0),
        note: formData.note.trim() || null
      });

    if (shiftError) {
      setError(`Schicht konnte nicht gespeichert werden: ${shiftError.message}`);
      setSaving(false);
      return;
    }

    setMessage('Schicht wurde gespeichert.');
    setShowForm(false);
    setSaving(false);
    await loadWeekShifts();
  }

  async function deleteShift(shiftId) {
    if (!window.confirm('Soll diese Schicht wirklich gelöscht werden?')) {
      return;
    }

    const { error: deleteError } = await supabase
      .from('shifts')
      .delete()
      .eq('id', shiftId);

    if (deleteError) {
      setError(`Schicht konnte nicht gelöscht werden: ${deleteError.message}`);
      return;
    }

    setMessage('Schicht wurde gelöscht.');
    await loadWeekShifts();
  }

  function changeWeek(daysToAdd) {
    const nextWeek = addDays(weekStart, daysToAdd);
    setWeekStart(nextWeek);
    setSelectedDate(formatDate(nextWeek));
  }

  return (
    <>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Planung</p>
          <h2>Dienstplan</h2>
          <p className="muted">
            Arbeitszeiten manuell planen und nach Abteilungen oder
            Einsatzbereichen verwalten.
          </p>
        </div>

        <button
          className="primary-button compact"
          onClick={() => openNewShift(new Date(selectedDate))}
        >
          + Schicht eintragen
        </button>
      </div>

      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message page-message">{error}</div>}

      <section className="content-card schedule-card">
        <div className="schedule-toolbar">
          <button
            className="secondary-button"
            onClick={() => changeWeek(-7)}
          >
            ← Vorherige Woche
          </button>

          <strong>
            {weekStart.toLocaleDateString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric'
            })}
            {' – '}
            {addDays(weekStart, 5).toLocaleDateString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric'
            })}
          </strong>

          <button
            className="secondary-button"
            onClick={() => changeWeek(7)}
          >
            Nächste Woche →
          </button>
        </div>

        <div className="week-grid">
          {days.map((day) => {
            const dateString = formatDate(day);
            const dayShifts = shifts.filter(
              (shift) => shift.plan_date === dateString
            );

            return (
              <button
                key={dateString}
                className={
                  selectedDate === dateString
                    ? 'day-card selected'
                    : 'day-card'
                }
                onClick={() => {
                setSelectedDate(dateString);
                setSelectedGroup({
                  type: 'all',
                  id: null,
                  name: 'Alle Bereiche'
                });
              }}
              >
                <span>{formatDisplayDate(day)}</span>
                <strong>{dayShifts.length}</strong>
                <small>Schichten</small>
              </button>
            );
          })}
        </div>
      </section>
      <section className="content-card overview-card">
  <div className="card-heading">
    <div>
      <p className="eyebrow">Besetzung</p>
      <h3>Abteilungen und Einsatzbereiche</h3>
      <p className="muted small-muted">
        Klicken Sie auf einen Bereich, um die dort geplanten Mitarbeiter
        anzuzeigen.
      </p>
    </div>
  </div>

  <div className="group-overview-grid">
    <button
      className={
        selectedGroup.type === 'all'
          ? 'group-overview-card selected'
          : 'group-overview-card'
      }
      onClick={() =>
        setSelectedGroup({
          type: 'all',
          id: null,
          name: 'Alle Bereiche'
        })
      }
    >
      <span className="group-overview-label">Gesamt</span>
      <strong>
        {new Set(visibleShifts.map((shift) => shift.employee_id)).size}
      </strong>
      <small>Mitarbeiter</small>
      <em>{visibleShifts.length} Schichten</em>
    </button>

    {departmentOverview.map((department) => (
      <button
        key={department.id}
        className={
          selectedGroup.type === 'department' &&
          selectedGroup.id === department.id
            ? 'group-overview-card selected'
            : 'group-overview-card'
        }
        onClick={() =>
          setSelectedGroup({
            type: 'department',
            id: department.id,
            name: department.name
          })
        }
      >
        <span className="group-overview-label">
          Abteilung
        </span>

        <strong>{department.employeeCount}</strong>
        <small>Mitarbeiter</small>
        <em>
          {department.name} · {department.shiftCount} Schichten
        </em>
      </button>
    ))}

    {areaOverview.map((area) => (
      <button
        key={area.id}
        className={
          selectedGroup.type === 'area' &&
          selectedGroup.id === area.id
            ? 'group-overview-card selected'
            : 'group-overview-card'
        }
        onClick={() =>
          setSelectedGroup({
            type: 'area',
            id: area.id,
            name: area.name
          })
        }
      >
        <span className="group-overview-label">
          Einsatzbereich
        </span>

        <strong>{area.employeeCount}</strong>
        <small>Mitarbeiter</small>
        <em>
          {area.name} · {area.shiftCount} Schichten
        </em>
      </button>
    ))}
  </div>
</section>
      <section className="content-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Tagesansicht</p>
            <h3>
              <h3>
              {selectedGroup.name} –{' '}
              {new Date(`${selectedDate}T12:00:00`).toLocaleDateString(
                'de-DE',
                {
                  weekday: 'long',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                }
              )}
            </h3>
            </h3>
          </div>

          <button
            className="primary-button compact"
            onClick={() => openNewShift(new Date(`${selectedDate}T12:00:00`))}
          >
            + Schicht
          </button>
        </div>

        {loading && (
          <div className="loading-inline">
            Mitarbeiter und Dienstplan werden geladen …
          </div>
        )}

        {!loading && visibleShifts.length === 0 && (
          <div className="empty-state compact-empty">
            <div className="empty-icon">▦</div>
            <strong>Noch keine Schichten eingetragen</strong>
            <span>
              Über „+ Schicht“ können Sie die erste Arbeitszeit für diesen Tag
              eintragen.
            </span>
          </div>
        )}

        {!loading && visibleShifts.length > 0 && (
          <div className="shift-list">
            {visibleShifts.map((shift) => (
              <div className="shift-row" key={shift.id}>
                <div className="shift-time">
                  <strong>
                    {shift.start_time.slice(0, 5)} –{' '}
                    {shift.end_time.slice(0, 5)}
                  </strong>
                  <span>
                    Netto: {formatHours(
                      calculateMinutes(
                        shift.start_time,
                        shift.end_time,
                        shift.break_minutes
                      )
                    )}
                  </span>
                </div>

                <div className="shift-person">
                  <strong>
                    {shift.employee?.first_name} {shift.employee?.last_name}
                  </strong>
                  <span>
                    {shift.department?.name ||
                      shift.assignment_area?.name ||
                      'Kein Bereich angegeben'}
                  </span>
                </div>

                <div className="shift-note">
                  {shift.note || 'Keine Notiz'}
                </div>

                <button
                  className="delete-button"
                  onClick={() => deleteShift(shift.id)}
                >
                  Löschen
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {showForm && (
        <ShiftFormModal
          date={selectedDate}
          employees={employees}
          departments={departments}
          areas={areas}
          saving={saving}
          onClose={() => setShowForm(false)}
          onSubmit={saveShift}
        />
      )}
    </>
  );
}

function ShiftFormModal({
  date,
  employees,
  departments,
  areas,
  saving,
  onClose,
  onSubmit
}) {
  const [formData, setFormData] = useState({
    plan_date: date,
    employee_id: '',
    department_id: '',
    assignment_area_id: '',
    start_time: '09:00',
    end_time: '18:00',
    break_minutes: '30',
    note: ''
  });

  const [formError, setFormError] = useState('');

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

    if (!formData.start_time || !formData.end_time) {
      setFormError('Bitte geben Sie Beginn und Ende ein.');
      return;
    }

    if (
      !formData.department_id &&
      !formData.assignment_area_id
    ) {
      setFormError(
        'Bitte wählen Sie eine Abteilung oder einen Einsatzbereich aus.'
      );
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
            <p className="eyebrow">Dienstplanung</p>
            <h3>Schicht eintragen</h3>
          </div>

          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="form-section">
            <div className="form-grid">
              <label>
                Datum
                <input
                  type="date"
                  name="plan_date"
                  value={formData.plan_date}
                  onChange={updateField}
                  required
                />
              </label>

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
                    <option value={employee.id} key={employee.id}>
                      {employee.last_name}, {employee.first_name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Beginn *
                <input
                  type="time"
                  name="start_time"
                  value={formData.start_time}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                Ende *
                <input
                  type="time"
                  name="end_time"
                  value={formData.end_time}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                Pause in Minuten
                <input
                  type="number"
                  name="break_minutes"
                  min="0"
                  step="15"
                  value={formData.break_minutes}
                  onChange={updateField}
                />
              </label>

              <label>
                Abteilung
                <select
                  name="department_id"
                  value={formData.department_id}
                  onChange={updateField}
                >
                  <option value="">Keine Abteilung</option>
                  {departments.map((department) => (
                    <option value={department.id} key={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Einsatzbereich
                <select
                  name="assignment_area_id"
                  value={formData.assignment_area_id}
                  onChange={updateField}
                >
                  <option value="">Kein Einsatzbereich</option>
                  {areas.map((area) => (
                    <option value={area.id} key={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Notiz
                <input
                  name="note"
                  placeholder="z. B. Schließdienst"
                  value={formData.note}
                  onChange={updateField}
                />
              </label>
            </div>
          </div>

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
              {saving ? 'Speichern …' : 'Schicht speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
