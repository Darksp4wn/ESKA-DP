import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import SchedulePage from './pages/SchedulePage';
import AbsencePage from './pages/AbsencePage';
import AbsenceCalendarPage from './pages/AbsenceCalendarPage';

const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'employees', label: 'Mitarbeiter', icon: '👥' },
  { id: 'schedule', label: 'Dienstplan', icon: '▦' },
  { id: 'absence', label: 'Urlaub & Abwesenheit', icon: '◫' },
  { id: 'absence-calendar', label: 'Abwesenheitskalender', icon: '▣' },
  { id: 'overtime', label: 'Überstunden', icon: '◷' },
  { id: 'reports', label: 'Auswertungen', icon: '▥' },
  { id: 'settings', label: 'Einstellungen', icon: '⚙' }
];

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState('dashboard');

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(data.session);
      if (data.session?.user) {
        await loadProfile(data.session.user.id);
      }

      setLoading(false);
    }

    loadSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);

      if (nextSession?.user) {
        await loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!error) {
      setProfile(data);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">D</div>
          <div>
            <strong>Dienstplan</strong>
            <span>Personalverwaltung</span>
          </div>
        </div>

        <nav className="main-nav">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={activePage === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => setActivePage(item.id)}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="secure-badge">🔒 Geschützter Bereich</div>
          <button className="logout-button" onClick={logout}>
            Abmelden
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Verwaltung</p>
            <h1>{getPageTitle(activePage)}</h1>
          </div>

          <div className="user-area">
            <div className="user-avatar">
              {getInitials(profile?.first_name, profile?.last_name)}
            </div>
            <div className="user-details">
              <strong>
                {profile?.first_name || 'Benutzer'} {profile?.last_name || ''}
              </strong>
              <span>{formatRole(profile?.role)}</span>
            </div>
          </div>
        </header>

        <section className="page-container">
          {activePage === 'dashboard' && (
            <Dashboard profile={profile} onNavigate={setActivePage} />
          )}

          {activePage === 'employees' && <EmployeesPage />}
          {activePage === 'absence-calendar' && <AbsenceCalendarPage />}
          {activePage === 'schedule' && <SchedulePage />}
          {activePage === 'absence' && <AbsencePage />}

          {activePage !== 'dashboard' &&
            activePage !== 'employees' &&
            activePage !== 'absence' &&
             activePage !== 'absence-calendar' &&
            activePage !== 'schedule' && (
              <PlaceholderPage page={activePage} />
            )}
        </section>
      </main>
    </div>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(event) {
    event.preventDefault();
    setMessage('');
    setSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      setMessage('Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.');
    }

    setSubmitting(false);
  }

  return (
    <div className="login-page">
      <div className="login-decoration">
        <div className="decoration-circle circle-one" />
        <div className="decoration-circle circle-two" />
        <div className="decoration-grid" />
      </div>

      <div className="login-card">
        <div className="login-logo">D</div>
        <p className="eyebrow">Personalverwaltung</p>
        <h1>Dienstplan</h1>
        <p className="login-subtitle">
          Arbeitszeiten, Urlaub und Mitarbeiter übersichtlich verwalten.
        </p>

        <form onSubmit={handleLogin} className="login-form">
          <label>
            E-Mail-Adresse
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@unternehmen.de"
              required
            />
          </label>

          <label>
            Passwort
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Passwort"
              required
            />
          </label>

          {message && <div className="error-message">{message}</div>}

          <button className="primary-button" disabled={submitting}>
            {submitting ? 'Anmeldung läuft …' : 'Anmelden'}
          </button>
        </form>

        <p className="login-footer">Zugriff nur für berechtigte Benutzer</p>
      </div>
    </div>
  );
}

function Dashboard({ profile, onNavigate }) {
  const [stats, setStats] = useState({
    employees: 0,
    scheduledEmployees: 0,
    currentAbsences: 0,
    overtimeMinutes: 0,
    plannedMinutes: 0
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboardStats();
  }, []);

  function getLocalDateKey() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  function calculateShiftMinutes(start, end, breakMinutes = 0) {
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

  async function loadDashboardStats() {
    setLoading(true);
    setError('');

    const today = getLocalDateKey();

    const [
      employeesResult,
      planResult,
      absencesResult,
      overtimeResult
    ] = await Promise.all([
      supabase
        .from('employees')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),

      supabase
        .from('schedule_plans')
        .select(`
          id,
          plan_date,
          shifts (
            id,
            employee_id,
            start_time,
            end_time,
            break_minutes
          )
        `)
        .eq('plan_date', today)
        .maybeSingle(),

      supabase
        .from('absences')
        .select('employee_id')
        .lte('start_date', today)
        .gte('end_date', today),

      supabase
        .from('overtime_entries')
        .select('minutes')
    ]);

    if (
      employeesResult.error ||
      planResult.error ||
      absencesResult.error ||
      overtimeResult.error
    ) {
      setError('Dashboard-Daten konnten nicht geladen werden.');
      setLoading(false);
      return;
    }

    const todayShifts = planResult.data?.shifts || [];

    const uniqueScheduledEmployees = new Set(
      todayShifts.map((shift) => shift.employee_id)
    );

    const uniqueAbsences = new Set(
      (absencesResult.data || []).map((absence) => absence.employee_id)
    );

    const plannedMinutes = todayShifts.reduce(
      (total, shift) =>
        total +
        calculateShiftMinutes(
          shift.start_time,
          shift.end_time,
          shift.break_minutes
        ),
      0
    );

    const overtimeMinutes = (overtimeResult.data || []).reduce(
      (total, entry) => total + Number(entry.minutes || 0),
      0
    );

    setStats({
      employees: employeesResult.count || 0,
      scheduledEmployees: uniqueScheduledEmployees.size,
      currentAbsences: uniqueAbsences.size,
      overtimeMinutes,
      plannedMinutes
    });

    setLoading(false);
  }

  function formatOvertime(minutes) {
    const sign = minutes < 0 ? '-' : '+';
    const absoluteMinutes = Math.abs(minutes);
    const hours = Math.floor(absoluteMinutes / 60);
    const remainingMinutes = absoluteMinutes % 60;

    return `${sign}${hours}:${String(remainingMinutes).padStart(2, '0')}`;
  }

  function formatHours(minutes) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return `${hours}:${String(remainingMinutes).padStart(2, '0')} Std.`;
  }

  return (
    <>
      <div className="welcome-row">
        <div>
          <p className="eyebrow">Übersicht</p>
          <h2>
            Guten Tag{profile?.first_name ? `, ${profile.first_name}` : ''}
          </h2>
          <p className="muted">
            Hier sehen Sie die aktuellen Informationen zum Dienstplan.
          </p>
        </div>

        <button
          className="primary-button compact"
          onClick={() => onNavigate('schedule')}
        >
          Dienstplan öffnen
        </button>
      </div>

      {error && <div className="error-message page-message">{error}</div>}

      <div className="stats-grid">
        <StatCard
          title="Mitarbeiter"
          value={loading ? '…' : stats.employees}
          detail="Aktive Mitarbeiter"
        />

        <StatCard
          title="Heutige Besetzung"
          value={loading ? '…' : stats.scheduledEmployees}
          detail="Mitarbeiter mit Schicht heute"
        />

        <StatCard
          title="Urlaub / Abwesenheit"
          value={loading ? '…' : stats.currentAbsences}
          detail="Aktuell abwesende Mitarbeiter"
        />

        <StatCard
          title="Überstunden"
          value={loading ? '…' : formatOvertime(stats.overtimeMinutes)}
          detail="Gesamtes Überstundenkonto"
        />
      </div>

      <div className="dashboard-grid">
        <section className="content-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Heute</p>
              <h3>Heutiger Dienstplan</h3>
            </div>

            <button
              className="text-button"
              onClick={() => onNavigate('schedule')}
            >
              Öffnen
            </button>
          </div>

          {loading ? (
            <div className="loading-inline">
              Dashboard wird geladen …
            </div>
          ) : stats.scheduledEmployees === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">▦</div>
              <strong>Noch keine Schichten vorhanden</strong>
              <span>
                Für heute wurden noch keine Mitarbeiter eingeplant.
              </span>
            </div>
          ) : (
            <div className="dashboard-summary">
              <strong>{stats.scheduledEmployees} Mitarbeiter eingeplant</strong>
              <span>
                Geplante Nettoarbeitszeit: {formatHours(stats.plannedMinutes)}
              </span>
            </div>
          )}
        </section>

        <section className="content-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Schnellzugriff</p>
              <h3>Verwaltung</h3>
            </div>
          </div>

          <div className="quick-actions">
            <button onClick={() => onNavigate('employees')}>
              <span>👥</span>
              Mitarbeiter verwalten
            </button>

            <button onClick={() => onNavigate('schedule')}>
              <span>▦</span>
              Dienstplan erstellen
            </button>

            <button onClick={() => onNavigate('absence')}>
              <span>◫</span>
              Urlaub eintragen
            </button>

            <button onClick={() => onNavigate('reports')}>
              <span>▥</span>
              Auswertungen öffnen
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadEmployees();
    loadMasterData();
  }, []);

  async function loadEmployees() {
    setLoading(true);
    setError('');

    const { data, error } = await supabase
      .from('employees')
      .select(`
        id,
        first_name,
        last_name,
        personnel_number,
        email,
        phone,
        location,
        employment_type,
        weekly_hours,
        contractual_monthly_hours,
        entry_date,
        exit_date,
        qualifications,
        work_time_model,
        vacation_entitlement,
        is_active,
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
      .order('last_name', { ascending: true });

    if (error) {
      setError(`Mitarbeiter konnten nicht geladen werden: ${error.message}`);
    } else {
      setEmployees(data || []);
    }

    setLoading(false);
  }

  async function loadMasterData() {
    const [departmentsResult, areasResult] = await Promise.all([
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

    setDepartments(departmentsResult.data || []);
    setAreas(areasResult.data || []);
  }

  async function createEmployee(formData) {
    setError('');
    setSuccess('');

    const employeeData = {
      first_name: formData.first_name.trim(),
      last_name: formData.last_name.trim(),
      personnel_number: formData.personnel_number.trim(),
      email: formData.email.trim() || null,
      phone: formData.phone.trim() || null,
      location: formData.location.trim() || 'Standort 1',
      employment_type: formData.employment_type,
      weekly_hours: Number(formData.weekly_hours) || 0,
      contractual_monthly_hours:
        formData.contractual_monthly_hours
          ? Number(formData.contractual_monthly_hours)
          : null,
      entry_date: formData.entry_date || null,
      exit_date: formData.exit_date || null,
      qualifications: formData.qualifications.trim() || null,
      work_time_model: formData.work_time_model.trim() || null,
      vacation_entitlement: Number(formData.vacation_entitlement) || 0,
      is_active: true
    };

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .insert(employeeData)
      .select('id')
      .single();

    if (employeeError) {
      setError(`Mitarbeiter konnte nicht angelegt werden: ${employeeError.message}`);
      return false;
    }

    if (formData.department_ids.length > 0) {
      const departmentRows = formData.department_ids.map((departmentId, index) => ({
        employee_id: employee.id,
        department_id: departmentId,
        is_primary: index === 0
      }));

      const { error: departmentError } = await supabase
        .from('employee_departments')
        .insert(departmentRows);

      if (departmentError) {
        await supabase
          .from('employees')
          .delete()
          .eq('id', employee.id);

        setError(`Abteilungen konnten nicht gespeichert werden: ${departmentError.message}`);
        return false;
      }
    }

    if (formData.area_ids.length > 0) {
      const areaRows = formData.area_ids.map((areaId) => ({
        employee_id: employee.id,
        assignment_area_id: areaId
      }));

      const { error: areaError } = await supabase
        .from('employee_assignment_areas')
        .insert(areaRows);

      if (areaError) {
        setError(`Einsatzbereiche konnten nicht gespeichert werden: ${areaError.message}`);
        return false;
      }
    }

    setSuccess('Mitarbeiter wurde erfolgreich angelegt.');
    setShowForm(false);
    await loadEmployees();
    return true;
  }

  return (
    <>
      <div className="page-heading-row">
        <div>
          <p className="eyebrow">Personal</p>
          <h2>Mitarbeiter</h2>
          <p className="muted">
            Mitarbeiterdaten, Abteilungen und Arbeitszeitmodelle verwalten.
          </p>
        </div>

        <button
          className="primary-button compact"
          onClick={() => {
            setError('');
            setSuccess('');
            setShowForm(true);
          }}
        >
          + Mitarbeiter anlegen
        </button>
      </div>

      {success && <div className="success-message">{success}</div>}
      {error && <div className="error-message page-message">{error}</div>}

      <div className="stats-grid small">
        <StatCard
          title="Mitarbeiter gesamt"
          value={employees.length}
          detail="Aktuelle Datenbank"
        />
        <StatCard
          title="Abteilungen"
          value={departments.length}
          detail="Haka bis Lederwaren"
        />
        <StatCard
          title="Einsatzbereiche"
          value={areas.length}
          detail="Hausmeister und Putzkräfte"
        />
      </div>

      <section className="content-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Datenbank</p>
            <h3>Mitarbeiterübersicht</h3>
          </div>

          <button className="secondary-button" onClick={loadEmployees}>
            Aktualisieren
          </button>
        </div>

        {loading && (
          <div className="loading-inline">
            Mitarbeiter werden geladen …
          </div>
        )}

        {!loading && employees.length === 0 && (
          <div className="empty-state compact-empty">
            <div className="empty-icon">👥</div>
            <strong>Noch keine Mitarbeiter angelegt</strong>
            <span>
              Legen Sie den ersten Mitarbeiter über die Schaltfläche oben an.
            </span>
          </div>
        )}

        {!loading && employees.length > 0 && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Personalnummer</th>
                  <th>Abteilungen</th>
                  <th>Einsatzbereiche</th>
                  <th>Beschäftigung</th>
                  <th>Wochenstunden</th>
                  <th>Urlaub</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td>
                      <strong>
                        {employee.first_name} {employee.last_name}
                      </strong>
                      {employee.email && (
                        <small className="table-subline">
                          {employee.email}
                        </small>
                      )}
                    </td>

                    <td>{employee.personnel_number}</td>

                    <td>
                      {employee.employee_departments?.length > 0
                        ? employee.employee_departments
                            .map((item) => item.department?.name)
                            .filter(Boolean)
                            .join(', ')
                        : '–'}
                    </td>

                    <td>
                      {employee.employee_assignment_areas?.length > 0
                        ? employee.employee_assignment_areas
                            .map((item) => item.assignment_area?.name)
                            .filter(Boolean)
                            .join(', ')
                        : '–'}
                    </td>

                    <td>{formatEmploymentType(employee.employment_type)}</td>
                    <td>{employee.weekly_hours} Stunden</td>
                    <td>{employee.vacation_entitlement} Tage</td>

                    <td>
                      <span
                        className={
                          employee.is_active
                            ? 'status active'
                            : 'status inactive'
                        }
                      >
                        {employee.is_active ? 'Aktiv' : 'Archiviert'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showForm && (
        <EmployeeFormModal
          departments={departments}
          areas={areas}
          onClose={() => setShowForm(false)}
          onSubmit={createEmployee}
        />
      )}
    </>
  );
}

function EmployeeFormModal({ departments, areas, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    personnel_number: '',
    email: '',
    phone: '',
    location: 'Standort 1',
    employment_type: 'vollzeit',
    weekly_hours: '40',
    contractual_monthly_hours: '',
    entry_date: '',
    exit_date: '',
    qualifications: '',
    work_time_model: '',
    vacation_entitlement: '30',
    department_ids: [],
    area_ids: []
  });

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  function updateField(event) {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value
    }));
  }

  function toggleSelection(field, id) {
    setFormData((current) => {
      const selected = current[field];

      return {
        ...current,
        [field]: selected.includes(id)
          ? selected.filter((item) => item !== id)
          : [...selected, id]
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');

    if (!formData.first_name.trim()) {
      setFormError('Bitte geben Sie den Vornamen ein.');
      return;
    }

    if (!formData.last_name.trim()) {
      setFormError('Bitte geben Sie den Nachnamen ein.');
      return;
    }

    if (!formData.personnel_number.trim()) {
      setFormError('Bitte geben Sie die Personalnummer ein.');
      return;
    }

    setSaving(true);
    const success = await onSubmit(formData);
    setSaving(false);

    if (!success) {
      setFormError('Der Mitarbeiter konnte nicht gespeichert werden.');
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card employee-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Personalverwaltung</p>
            <h3>Mitarbeiter anlegen</h3>
          </div>

          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <h4>Persönliche Daten</h4>

            <div className="form-grid">
              <label>
                Vorname *
                <input
                  name="first_name"
                  value={formData.first_name}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                Nachname *
                <input
                  name="last_name"
                  value={formData.last_name}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                Personalnummer *
                <input
                  name="personnel_number"
                  value={formData.personnel_number}
                  onChange={updateField}
                  required
                />
              </label>

              <label>
                E-Mail-Adresse
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={updateField}
                />
              </label>

              <label>
                Telefonnummer
                <input
                  name="phone"
                  value={formData.phone}
                  onChange={updateField}
                />
              </label>

              <label>
                Standort
                <input
                  name="location"
                  value={formData.location}
                  onChange={updateField}
                />
              </label>
            </div>
          </div>

          <div className="form-section">
            <h4>Beschäftigung</h4>

            <div className="form-grid">
              <label>
                Beschäftigungsart
                <select
                  name="employment_type"
                  value={formData.employment_type}
                  onChange={updateField}
                >
                  <option value="vollzeit">Vollzeit</option>
                  <option value="teilzeit">Teilzeit</option>
                  <option value="minijob">Minijob</option>
                  <option value="sonstige">Sonstige</option>
                </select>
              </label>

              <label>
                Wochenarbeitszeit
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  name="weekly_hours"
                  value={formData.weekly_hours}
                  onChange={updateField}
                />
              </label>

              <label>
                Vertragliche Sollstunden monatlich
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  name="contractual_monthly_hours"
                  value={formData.contractual_monthly_hours}
                  onChange={updateField}
                />
              </label>

              <label>
                Arbeitszeitmodell
                <input
                  name="work_time_model"
                  placeholder="z. B. Vollzeit Standard"
                  value={formData.work_time_model}
                  onChange={updateField}
                />
              </label>

              <label>
                Eintrittsdatum
                <input
                  type="date"
                  name="entry_date"
                  value={formData.entry_date}
                  onChange={updateField}
                />
              </label>

              <label>
                Austrittsdatum
                <input
                  type="date"
                  name="exit_date"
                  value={formData.exit_date}
                  onChange={updateField}
                />
              </label>

              <label>
                Urlaubsanspruch pro Jahr
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  name="vacation_entitlement"
                  value={formData.vacation_entitlement}
                  onChange={updateField}
                />
              </label>

              <label>
                Qualifikationen
                <input
                  name="qualifications"
                  value={formData.qualifications}
                  onChange={updateField}
                />
              </label>
            </div>
          </div>

          <div className="form-section">
            <h4>Abteilungen</h4>
            <p className="form-help">
              Eine Zuordnung ist optional. Mitarbeiter aus separaten Einsatzbereichen
              können ohne Abteilung angelegt werden.
            </p>

            <div className="checkbox-grid">
              {departments.map((department) => (
                <label className="checkbox-label" key={department.id}>
                  <input
                    type="checkbox"
                    checked={formData.department_ids.includes(department.id)}
                    onChange={() =>
                      toggleSelection('department_ids', department.id)
                    }
                  />
                  <span>{department.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-section">
            <h4>Separate Einsatzbereiche</h4>
            <p className="form-help">
            Hausmeister, Putzkräfte, Deko, Buchhaltung und Geschäftsführung werden
            unabhängig von den Abteilungen verwaltet.
            </p>
            <div className="checkbox-grid">
              {areas.map((area) => (
                <label className="checkbox-label" key={area.id}>
                  <input
                    type="checkbox"
                    checked={formData.area_ids.includes(area.id)}
                    onChange={() => toggleSelection('area_ids', area.id)}
                  />
                  <span>{area.name}</span>
                </label>
              ))}
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
              {saving ? 'Speichern …' : 'Mitarbeiter speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PlaceholderPage({ page }) {
  return (
    <section className="content-card placeholder-card">
      <div className="empty-state">
        <div className="empty-icon">{getPageIcon(page)}</div>
        <h3>{getPageTitle(page)}</h3>
        <span>
          Dieser Bereich ist in der nächsten Ausbaustufe von „Dienstplan“
          vorgesehen.
        </span>
      </div>
    </section>
  );
}

function StatCard({ title, value, detail }) {
  return (
    <div className="stat-card">
      <span className="stat-title">{title}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-detail">{detail}</span>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-logo">D</div>
      <strong>Dienstplan wird geladen …</strong>
    </div>
  );
}

function getPageTitle(page) {
  return navigation.find((item) => item.id === page)?.label || 'Dienstplan';
}

function getPageIcon(page) {
  return navigation.find((item) => item.id === page)?.icon || 'D';
}

function getInitials(firstName, lastName) {
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || 'D';
}

function formatRole(role) {
  const roles = {
    systemadministrator: 'Systemadministrator',
    geschaeftsfuehrer: 'Geschäftsführer',
    abteilungsleiter: 'Abteilungsleiter',
    mitarbeiter: 'Mitarbeiter'
  };

  return roles[role] || 'Benutzer';
}

function formatEmploymentType(type) {
  const types = {
    vollzeit: 'Vollzeit',
    teilzeit: 'Teilzeit',
    minijob: 'Minijob',
    sonstige: 'Sonstige'
  };

  return types[type] || type || '–';
}

export default App;
