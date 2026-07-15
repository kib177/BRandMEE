async function checkAuth() {
  const token = sessionStorage.getItem('token');
  if (!token) {
    // Чтобы не зациклиться на самой странице входа
    if (!window.location.pathname.includes('welcome.html')) {
      window.location.href = '/welcome.html';
    }
    return;
  }
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      logout();
      return;
    }
    const data = await res.json();
    currentUser = data.user;
    updateAuthUI();
    resetInactivityTimer();
  } catch (e) {
    logout();
  }
}
