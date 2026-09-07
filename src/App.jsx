import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'employees', label: 'Mitarbeiter', icon: '👥' },
  { id: 'schedule', label: 'Dienstplan', icon: '▦' },
  { id: 'absence', label: 'Urlaub & Abwesenheit', icon: '◫' },
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

          {activePage !== 'dashboard' && activePage !== 'employees' && (
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
  return (
    <>
      <div className="welcome-row">
        <div>
          <p className="eyebrow">Übersicht</p>
          <h2>
            Guten Tag{profile?.first_name ? `, ${profile.first_name}` : ''}
          </h2>
          <p className="muted">
            Hier sehen Sie die wichtigsten Informationen zum Dienstplan.
          </p>
        </div>

        <button
          className="primary-button compact"
          onClick={() => onNavigate('schedule')}
        >
          Dienstplan öffnen
        </button>
      </div>

      <div className="stats-grid">
        <StatCard title="Mitarbeiter" value="0" detail="Noch keine Mitarbeiter angelegt" />
        <StatCard title="Heutige Besetzung" value="–" detail="Noch keine Planung vorhanden" />
        <StatCard title="Urlaub aktuell" value="0" detail="Keine Abwesenheiten eingetragen" />
        <StatCard title="Überstunden" value="0:00" detail="Noch keine Konten vorhanden" />
      </div>

      <div className="dashboard-grid">
        <section className="content-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Heute</p>
              <h3>Heutiger Dienstplan</h3>
            </div>
            <button className="text-button" onClick={() => onNavigate('schedule')}>
              Öffnen
            </button>
          </div>

          <div className="empty-state">
            <div className="empty-icon">▦</div>
            <strong>Noch kein Dienstplan vorhanden</strong>
            <span>Erstellen Sie den ersten Dienstplan im Bereich „Dienstplan“.</span>
          </div>
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
  const [error, setError] = useState('');

  useEffect(() => {
    loadEmployees();
  }, []);

  async function loadEmployees() {
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
          is_active
        `)
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
      setError('Mitarbeiter konnten nicht geladen werden.');
    } else {
      setEmployees(employeesResult.data || []);
    }

    setDepartments(departmentsResult.data || []);
    setAreas(areasResult.data || []);
    setLoading(false);
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

        <button className="primary-button compact">
          + Mitarbeiter anlegen
        </button>
      </div>

      <div className="stats-grid small">
        <StatCard title="Mitarbeiter gesamt" value={employees.length} detail="Aktuelle Datenbank" />
        <StatCard title="Abteilungen" value={departments.length} detail="Haka bis Lederwaren" />
        <StatCard title="Einsatzbereiche" value={areas.length} detail="Hausmeister und Putzkräfte" />
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

        {loading && <div className="loading-inline">Daten werden geladen …</div>}

        {error && <div className="error-message">{error}</div>}

        {!loading && !error && employees.length === 0 && (
          <div className="empty-state compact-empty">
            <div className="empty-icon">👥</div>
            <strong>Noch keine Mitarbeiter angelegt</strong>
            <span>
              Die Mitarbeiterverwaltung wird im nächsten Entwicklungsschritt
              um das Anlegen und Bearbeiten erweitert.
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
                  <th>Beschäftigung</th>
                  <th>Wochenstunden</th>
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
                    </td>
                    <td>{employee.personnel_number}</td>
                    <td>{formatEmploymentType(employee.employment_type)}</td>
                    <td>{employee.weekly_hours} Stunden</td>
                    <td>
                      <span className={employee.is_active ? 'status active' : 'status inactive'}>
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
    </>
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
