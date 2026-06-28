document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const guestBtn = document.getElementById('guest-btn');
    const authSubmitBtn = document.getElementById('auth-submit');
    
    // Tabs
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    
    let isLoginMode = true;

    // --- Tab Switching Logic ---
    tabRegister.addEventListener('click', () => {
        isLoginMode = false;
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        authSubmitBtn.textContent = 'Create account';
    });

    tabLogin.addEventListener('click', () => {
        isLoginMode = true;
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        authSubmitBtn.textContent = 'Login';
    });

    // --- Guest Access ---
    guestBtn.addEventListener('click', () => {
        // Bypass login and go straight to the app
        window.location.href = 'dashboard.html';
    });

    // --- Form Submission ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Prevents the page from refreshing natively
        
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        
        if (!username || !password) return;

        // Password validation: minimum 8 characters, 1 capital letter, 1 number, 1 special character
        const hasUpperCase = /[A-Z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        const hasSpecialChar = /[^A-Za-z0-9]/.test(password); // Anything that is not a letter or number

        if (password.length < 8 || !hasUpperCase || !hasNumber || !hasSpecialChar) {
            alert('Password must be at least 8 characters long, include one capital letter, one number, and one special character.');
            return;
        }

        // Determine which endpoint to hit based on the active tab
        const endpoint = isLoginMode ? '/login' : '/register';
        
        try {
            console.log(`Sending request to ${endpoint}...`);
            
            // Use relative path!
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            console.log('Server responded with status:', response.status);
            const data = await response.json();

            if (response.ok) {
                // If login/register is successful, save the mock token and redirect
                if (data.token) {
                    localStorage.setItem('skillgap_token', data.token);
                }
                // Redirect to the analyzer tool
                window.location.href = 'dashboard.html';
            } else {
                alert(data.message || 'Authentication failed. Please try again.');
            }

        } catch (error) {
            console.error('Auth Error:', error);
            alert('Cannot connect to the server. Is your Node.js terminal running?');
        }
    });
});
