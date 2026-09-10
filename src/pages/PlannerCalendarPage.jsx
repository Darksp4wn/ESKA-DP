import { useEffect, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import deLocale from '@fullcalendar/core/locales/de';
import { supabase } from '../lib/supabase';

const absenceLabels = {
  urlaub: 'Urlaub',
  krankheit: 'Krankheit',
  sonderurlaub: 'Sonderurlaub',
  fortbildung: 'Fortbildung',
  unbezahlt: 'Unbezahlte Abwesenheit',
  sonstige: 'Sonstige Abwesenheit'
};

const absenceColors = {
  urlaub: '#1971b5',
  krankheit: '#c43d3d',
  sonderurlaub: '#a4771c',
  fortbildung: '#7655b6',
  unbezahlt: '#697586',
  sonstige: '#3b8c68'
};

function getTodayKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatTime(value) {
  if (!value) return '';

  return value.slice(0, 5);
}

function calculateMinutes(start, end, breakMinutes = 0) {
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

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}:${String(remainingMinutes).padStart(2, '0')} Std.`;
}

function formatDateTime(value) {
  if (!value) return '–';

  return new Date(value).toLocaleString('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function getEmployeeName(employee) {
  if (!employee) return 'Unbekannter Mitarbeiter';

  return `${employee.first_name || ''} ${employee.last_name || ''}`.trim();
}

function getEmployeeLabel(employee) {
  if (!employee) return 'Unbekannter Mitarbeiter';

  return `${employee.last_name || ''}, ${employee.first_name || ''}`.trim();
}

function getDepartmentNames(employee) {
  return (employee.employee_departments || [])
    .map((item) => item.department?.name)
    .filter(Boolean);
}

function getAreaNames(employee) {
  return (employee.employee_assignment_areas || [])
    .map((item) => item.assignment_area?.name)
    .filter(Boolean);
}

export default function PlannerCalendarPage() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [calendarTitle, setCalendarTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const selectedEmployee = useMemo(() => {
    return employees.find(
      (employee) => employee.id === selectedEmployeeId
    ) || null;
  }, [employees, selectedEmployeeId]);

  const visibleEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const matchesDepartment =
        !selectedDepartmentId ||
        getDepartmentNames(employee).some(
          (name) => name === selectedDepartmentId
        );

      const matchesArea =
        !selectedAreaId ||
        getAreaNames(employee).some(
          (name) => name === selectedAreaId
        );

      return matchesDepartment && matchesArea;
    });
  }, [
    employees,
    selectedDepartmentId,
    selectedAreaId
  ]);

  const employeeMonthlySummary = useMemo(() => {
    if (!selectedEmployeeId) return null;

    const employeeEvents = calendarEvents.filter(
      (event) =>
        event.extendedProps?.employeeId === selectedEmployeeId &&
        event.extendedProps?.eventType === 'shift'
    );

    const plannedMinutes = employeeEvents.reduce(
      (total, event) =>
        total +
        Number(event.extendedProps?.netMinutes || 0),
      0
    );

    const absenceEvents = calendarEvents.filter(
      (event) =>
        event.extendedProps?.employeeId === selectedEmployeeId &&
        event.extendedProps?.eventType === 'absence'
    );

    return {
      shiftCount: employeeEvents.length,
      plannedMinutes,
      absenceCount: absenceEvents.length
    };
  }, [calendarEvents, selectedEmployeeId]);

  useEffect(() => {
    loadEmployeesAndMasterData();
  }, []);

  async function loadEmployeesAndMasterData() {
    setLoading(true);
    setError('');

    const [
      employeesResult,
      departmentsResult,
      areasResult
    ] = await Promise.all([
      supabase
        .from('employees')
        .select(`
          id,
          first_name,
          last_name,
          personnel_number,
          employment_type,
          weekly_hours,
          vacation_entitlement,
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
        .order('last_name', { ascending: true }),

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
      setError(
        `Mitarbeiter konnten nicht geladen werden: ${employeesResult.error.message}`
      );
    } else {
      setEmployees(employeesResult.data || []);
    }

    if (departmentsResult.error) {
      setError(
        `Abteilungen konnten nicht geladen werden: ${departmentsResult.error.message}`
      );
    } else {
      setDepartments(departmentsResult.data || []);
    }

    if (areasResult.error) {
      setError(
        `Einsatzbereiche konnten nicht geladen werden: ${areasResult.error.message}`
      );
    } else {
      setAreas(areasResult.data || []);
    }

    setLoading(false);
  }

  async function loadCalendarEvents(fetchInfo) {
    setError('');

    const startDate = fetchInfo.startStr.slice(0, 10);
    const endDate = fetchInfo.endStr.slice(0, 10);

    const [
      plansResult,
      absencesResult
    ] = await Promise.all([
      supabase
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
              id,
              first_name,
              last_name
            ),
            department:departments (
              id,
              name
            ),
            assignment_area:assignment_areas (
              id,
              name
            )
          )
        `)
        .gte('plan_date', startDate)
        .lt('plan_date', endDate)
        .order('plan_date'),

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
            id,
            first_name,
            last_name
          )
        `)
        .lte('start_date', endDate)
        .gte('end_date', startDate)
        .order('start_date')
    ]);

    if (plansResult.error) {
      setError(
        `Dienstplandaten konnten nicht geladen werden: ${plansResult.error.message}`
      );
      return;
    }

    if (absencesResult.error) {
      setError(
        `Abwesenheiten konnten nicht geladen werden: ${absencesResult.error.message}`
      );
      return;
    }

    const events = [];

    (plansResult.data || []).forEach((plan) => {
      (plan.shifts || []).forEach((shift) => {
        const employee = shift.employee;
        const employeeName = getEmployeeName(employee);
        const netMinutes = calculateMinutes(
          shift.start_time,
          shift.end_time,
          shift.break_minutes
        );

        const location =
          shift.department?.name ||
          shift.assignment_area?.name ||
          'Kein Bereich';

        const eventColor = shift.assignment_area_id
          ? '#5c8fbc'
          : '#1971b5';

        events.push({
          id: `shift-${shift.id}`,
          title: `${employeeName} · ${location}`,
          start: `${plan.plan_date}T${shift.start_time}`,
          end: `${plan.plan_date}T${shift.end_time}`,
          backgroundColor: eventColor,
          borderColor: eventColor,
          textColor: '#ffffff',
          extendedProps: {
            eventType: 'shift',
            shiftId: shift.id,
            employeeId: shift.employee_id,
            employeeName,
            departmentName: shift.department?.name || '',
            areaName: shift.assignment_area?.name || '',
            startTime: formatTime(shift.start_time),
            endTime: formatTime(shift.end_time),
            breakMinutes: shift.break_minutes || 0,
            netMinutes,
            note: shift.note || ''
          }
        });
      });
    });

    (absencesResult.data || []).forEach((absence) => {
      const employeeName = getEmployeeName(absence.employee);
      const color =
        absenceColors[absence.absence_type] || '#3b8c68';

      const endDateExclusive = new Date(
        `${absence.end_date}T12:00:00`
      );

      endDateExclusive.setDate(endDateExclusive.getDate() + 1);

      const endDateKey = endDateExclusive
        .toISOString()
        .slice(0, 10);

      events.push({
        id: `absence-${absence.id}`,
        title: `${employeeName} · ${
          absenceLabels[absence.absence_type] ||
          absence.absence_type
        }`,
        start: absence.start_date,
        end: endDateKey,
        allDay: true,
        backgroundColor: color,
        borderColor: color,
        textColor: '#ffffff',
        extendedProps: {
          eventType: 'absence',
          absenceId: absence.id,
          employeeId: absence.employee_id,
          employeeName,
          absenceType:
            absenceLabels[absence.absence_type] ||
            absence.absence_type,
          startDate: absence.start_date,
          endDate: absence.end_date,
          days: absence.days,
          note: absence.note || ''
        }
      });
    });

    setCalendarEvents(events);
  }

  function handleDatesSet(info) {
    setCalendarTitle(info.view.title);
    loadCalendarEvents(info);
  }

  function handleEventClick(info) {
    setSelectedEvent(info.event);
  }

  function handleEmployeeSelection(event) {
    setSelectedEmployeeId(event.target.value);
  }

  function clearEmployeeSelection() {
    setSelectedEmployeeId('');
  }

  return (
    <>
      <div className="page-heading-row planner-page-heading">
        <div>
          <p className="eyebrow">Planung</p>
          <h2>Dienstplan</h2>
          <p className="muted">
            Monats-, Wochen- und Tagesansicht für die gesamte Belegschaft.
          </p>
        </div>

        <div className="planner-header-actions">
          <button
            className="secondary-button"
            onClick={loadEmployeesAndMasterData}
          >
            Daten aktualisieren
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message page-message">
          {error}
        </div>
      )}

      <section className="content-card planner-filter-card">
        <div className="planner-filter-grid">
          <label>
            Mitarbeiter
            <select
              value={selectedEmployeeId}
              onChange={handleEmployeeSelection}
            >
              <option value="">Alle Mitarbeiter</option>

              {visibleEmployees.map((employee) => (
                <option
                  key={employee.id}
                  value={employee.id}
                >
                  {getEmployeeLabel(employee)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Abteilung
            <select
              value={selectedDepartmentId}
              onChange={(event) => {
                setSelectedDepartmentId(event.target.value);
                setSelectedEmployeeId('');
              }}
            >
              <option value="">Alle Abteilungen</option>

              {departments.map((department) => (
                <option
                  key={department.id}
                  value={department.id}
                >
                  {department.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Einsatzbereich
            <select
              value={selectedAreaId}
              onChange={(event) => {
                setSelectedAreaId(event.target.value);
                setSelectedEmployeeId('');
              }}
            >
              <option value="">Alle Einsatzbereiche</option>

              {areas.map((area) => (
                <option
                  key={area.id}
                  value={area.id}
                >
                  {area.name}
                </option>
              ))}
            </select>
          </label>

          {selectedEmployeeId && (
            <button
              className="secondary-button clear-filter-button"
              onClick={clearEmployeeSelection}
            >
              Mitarbeiterfilter entfernen
            </button>
          )}
        </div>

        {selectedEmployee && (
          <div className="selected-employee-banner">
            <div className="selected-employee-avatar">
              {selectedEmployee.first_name?.[0]}
              {selectedEmployee.last_name?.[0]}
            </div>

            <div>
              <span>Persönliche Kalenderansicht</span>
              <strong>
                {getEmployeeName(selectedEmployee)}
              </strong>
            </div>

            <div className="selected-employee-details">
              <span>
                Sollzeit: {selectedEmployee.weekly_hours || 0} Std./Woche
              </span>

              <span>
                Geplante Schichten:{' '}
                {employeeMonthlySummary?.shiftCount || 0}
              </span>

              <span>
                Geplante Zeit:{' '}
                {formatDuration(
                  employeeMonthlySummary?.plannedMinutes || 0
                )}
              </span>

              <span>
                Abwesenheiten:{' '}
                {employeeMonthlySummary?.absenceCount || 0}
              </span>
            </div>
          </div>
        )}
      </section>

      {!selectedEmployeeId && visibleEmployees.length > 0 && (
        <section className="content-card employee-quick-select-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Mitarbeiterkalender</p>
              <h3>Mitarbeiter anklicken</h3>
              <p className="muted small-muted">
                Klicken Sie auf einen Mitarbeiter, um nur dessen Einsätze
                und Abwesenheiten zu sehen.
              </p>
            </div>
          </div>

          <div className="employee-quick-select-list">
            {visibleEmployees.map((employee) => (
              <button
                className="employee-quick-select"
                key={employee.id}
                onClick={() => setSelectedEmployeeId(employee.id)}
              >
                <span className="employee-quick-avatar">
                  {employee.first_name?.[0]}
                  {employee.last_name?.[0]}
                </span>

                <span className="employee-quick-text">
                  <strong>{getEmployeeName(employee)}</strong>
                  <small>
                    {getDepartmentNames(employee).join(', ') ||
                      getAreaNames(employee).join(', ') ||
                      'Kein Bereich'}
                  </small>
                </span>

                <span className="employee-quick-arrow">›</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="content-card planner-calendar-card">
        <div className="planner-calendar-topline">
          <div>
            <p className="eyebrow">Kalender</p>
            <h3>
              {selectedEmployee
                ? `Kalender von ${getEmployeeName(selectedEmployee)}`
                : 'Gesamter Dienstplan'}
            </h3>
          </div>

          <span className="planner-current-period">
            {calendarTitle}
          </span>
        </div>

        {loading ? (
          <div className="loading-inline">
            Kalender wird geladen …
          </div>
        ) : (
          <div className="professional-calendar-wrapper">
            <FullCalendar
              plugins={[
                dayGridPlugin,
                timeGridPlugin,
                interactionPlugin
              ]}
              initialView="dayGridMonth"
              locale={deLocale}
              firstDay={1}
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
              }}
              buttonText={{
                today: 'Heute',
                month: 'Monat',
                week: 'Woche',
                day: 'Tag'
              }}
              height="auto"
              contentHeight="auto"
              expandRows
              nowIndicator
              allDayText="Ganztägig"
              slotMinTime="06:00:00"
              slotMaxTime="22:00:00"
              slotDuration="00:30:00"
              eventTimeFormat={{
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              }}
              events={calendarEvents.filter((event) => {
  const props = event.extendedProps || {};

  const matchesEmployee =
    !selectedEmployeeId ||
    props.employeeId === selectedEmployeeId;

  const matchesDepartment =
    !selectedDepartmentId ||
    props.departmentName ===
      departments.find(
        (department) => department.id === selectedDepartmentId
      )?.name;

  const matchesArea =
    !selectedAreaId ||
    props.areaName ===
      areas.find(
        (area) => area.id === selectedAreaId
      )?.name;

  return (
    matchesEmployee &&
    matchesDepartment &&
    matchesArea
  );
})}
              datesSet={handleDatesSet}
              eventClick={handleEventClick}
              eventClassNames={(eventInfo) => {
                if (
                  eventInfo.event.extendedProps?.eventType ===
                  'absence'
                ) {
                  return ['planner-absence-event'];
                }

                return ['planner-shift-event'];
              }}
              eventContent={(eventInfo) => {
                const event = eventInfo.event;
                const props = event.extendedProps;

                if (props.eventType === 'absence') {
                  return (
                    <div className="planner-event-content">
                      <strong>{props.employeeName}</strong>
                      <span>{props.absenceType}</span>
                    </div>
                  );
                }

                return (
                  <div className="planner-event-content">
                    <strong>
                      {props.startTime}–{props.endTime}
                    </strong>
                    <span>{props.employeeName}</span>
                    <small>
                      {props.departmentName ||
                        props.areaName ||
                        'Kein Bereich'}
                    </small>
                  </div>
                );
              }}
            />
          </div>
        )}
      </section>

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onSelectEmployee={(employeeId) => {
            setSelectedEmployeeId(employeeId);
            setSelectedEvent(null);
          }}
        />
      )}
    </>
  );
}

function EventDetailModal({
  event,
  onClose,
  onSelectEmployee
}) {
  const props = event.extendedProps || {};
  const isShift = props.eventType === 'shift';

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card event-detail-modal"
        onMouseDown={(eventObject) =>
          eventObject.stopPropagation()
        }
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">
              {isShift ? 'Arbeitszeit' : 'Abwesenheit'}
            </p>

            <h3>
              {isShift
                ? props.employeeName
                : props.employeeName}
            </h3>
          </div>

          <button
            className="modal-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="event-detail-list">
          {isShift ? (
            <>
              <div>
                <span>Datum</span>
                <strong>
                  {formatDateTime(event.start)}
                </strong>
              </div>

              <div>
                <span>Arbeitszeit</span>
                <strong>
                  {props.startTime}–{props.endTime}
                </strong>
              </div>

              <div>
                <span>Pause</span>
                <strong>{props.breakMinutes} Minuten</strong>
              </div>

              <div>
                <span>Nettoarbeitszeit</span>
                <strong>
                  {formatDuration(props.netMinutes)}
                </strong>
              </div>

              <div>
                <span>Bereich</span>
                <strong>
                  {props.departmentName ||
                    props.areaName ||
                    'Kein Bereich'}
                </strong>
              </div>

              <div>
                <span>Notiz</span>
                <strong>{props.note || 'Keine Notiz'}</strong>
              </div>
            </>
          ) : (
            <>
              <div>
                <span>Art</span>
                <strong>{props.absenceType}</strong>
              </div>

              <div>
                <span>Zeitraum</span>
                <strong>
                  {props.startDate} – {props.endDate}
                </strong>
              </div>

              <div>
                <span>Tage</span>
                <strong>{props.days}</strong>
              </div>

              <div>
                <span>Bemerkung</span>
                <strong>{props.note || 'Keine Bemerkung'}</strong>
              </div>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button
            className="secondary-button"
            onClick={() => {
              if (props.employeeId) {
                onSelectEmployee(props.employeeId);
              } else {
                onClose();
              }
            }}
          >
            Mitarbeiter anzeigen
          </button>

          <button
            className="primary-button"
            onClick={onClose}
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
