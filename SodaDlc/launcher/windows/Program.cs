using Microsoft.Web.WebView2.WinForms;
using Microsoft.Web.WebView2.Core;
using Newtonsoft.Json.Linq;
using System;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace SodaLauncher
{
    internal static class Program
    {
        [STAThread]
        static void Main()
        {
            ApplicationConfiguration.Initialize();
            Application.Run(new LauncherForm());
        }
    }

    public class LauncherForm : Form
    {
        private readonly WebView2 _webView;
        private readonly string _appVersion = "1.0.0";
        private readonly string _apiBase = "http://localhost:3000"; // Change for production
        private string _currentBrand = "SodaDlc";
        private JObject _userData;
        private bool _launchReady = false;

        public LauncherForm()
        {
            Text = "Soda Launcher";
            Width = 520;
            Height = 720;
            MinimumSize = new System.Drawing.Size(500, 700);
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            BackColor = System.Drawing.Color.FromArgb(0x0A, 0x0C, 0x0A);

            // Load icon
            try
            {
                var iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "assets", "logo.ico");
                if (File.Exists(iconPath)) Icon = new System.Drawing.Icon(iconPath);
            }
            catch { }

            _webView = new WebView2
            {
                Dock = DockStyle.Fill,
                BackColor = System.Drawing.Color.FromArgb(0x0A, 0x0C, 0x0A)
            };
            Controls.Add(_webView);

            Load += async (s, e) => await InitializeAsync();
        }

        private async Task InitializeAsync()
        {
            var env = await CoreWebView2Environment.CreateAsync(
                userDataFolder: Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SodaLauncher"),
                options: new CoreWebView2EnvironmentOptions("--disable-web-security --allow-running-insecure-content"));

            await _webView.EnsureCoreWebView2Async(env);

            // Configure WebView2
            _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            _webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
            _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            _webView.CoreWebView2.Settings.IsZoomControlEnabled = false;

            // Add host objects for JS bridge
            _webView.CoreWebView2.AddHostObjectToScript("launcherHost", new LauncherHost(this));

            // Handle navigation
            _webView.CoreWebView2.NavigationStarting += (s, e) =>
            {
                if (!e.Uri.StartsWith("http://localhost:3000") && !e.Uri.StartsWith("https://") && !e.Uri.StartsWith("file://"))
                {
                    e.Cancel = true;
                }
            };

            // Load local HTML
            var htmlPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "assets", "launcher.html");
            if (File.Exists(htmlPath))
            {
                _webView.CoreWebView2.NavigateToString(await File.ReadAllTextAsync(htmlPath));
            }
            else
            {
                MessageBox.Show($"Launcher HTML not found at: {htmlPath}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // Called from JavaScript via launcherHost
        public async Task<JObject> ApiCallAsync(string path, JObject body = null, string method = "POST")
        {
            using var http = new System.Net.Http.HttpClient();
            http.BaseAddress = new Uri(_apiBase);
            http.DefaultRequestHeaders.Add("Accept", "application/json");

            var request = new System.Net.Http.HttpRequestMessage(new System.Net.Http.HttpMethod(method), path)
            {
                Content = body != null ? new System.Net.Http.StringContent(body.ToString(), System.Text.Encoding.UTF8, "application/json") : null
            };

            // Add cookie if we have session
            if (_userData?["token"] != null)
            {
                request.Headers.Add("Cookie", $"soda_session={_userData["token"]}");
            }

            var response = await http.SendAsync(request);
            var json = await response.Content.ReadAsStringAsync();
            var data = JObject.Parse(json);

            if (!response.IsSuccessStatusCode)
                throw new Exception(data["error"]?.ToString() ?? $"HTTP {(int)response.StatusCode}");

            return data;
        }

        public async Task<JObject> LauncherApiAsync(string path, JObject body)
        {
            body ??= new JObject();
            body["brand"] = _currentBrand;
            body["version"] = _appVersion;
            body["os"] = "windows";
            body["arch"] = Environment.Is64BitOperatingSystem ? "x64" : "x86";
            return await ApiCallAsync("/api/launcher" + path, body);
        }

        public void SetUserData(JObject data)
        {
            _userData = data;
            if (data["token"] != null)
            {
                // Store token for cookie
            }
        }

        public void SetLaunchReady(bool ready) => _launchReady = ready;
        public void SetBrand(string brand) => _currentBrand = brand;
        public string GetBrand() => _currentBrand;

        // Bridge class exposed to JavaScript
        [System.Runtime.InteropServices.ComVisible(true)]
        [System.Runtime.Versioning.SupportedOSPlatform("windows")]
        public class LauncherHost
        {
            private readonly LauncherForm _form;

            public LauncherHost(LauncherForm form) => _form = form;

            public async Task<string> Login(string username, string password)
            {
                var data = await _form.LauncherApiAsync("/auth", new JObject
                {
                    ["username"] = username,
                    ["password"] = password
                });
                _form.SetUserData(data);
                return data.ToString();
            }

            public async Task<string> ActivateKey(string key)
            {
                var data = await _form.LauncherApiAsync("/activate", new JObject { ["key"] = key });
                return data.ToString();
            }

            public async Task<string> GetStatus()
            {
                var data = await _form.ApiCallAsync("/api/launcher/status");
                _form.SetLaunchReady(data["canLaunch"]?.Value<bool>() ?? false);
                return data.ToString();
            }

            public async Task<string> CheckVersion()
            {
                var data = await _form.ApiCallAsync($"/api/launcher/version?brand={_form.GetBrand()}&current={_form._appVersion}");
                return data.ToString();
            }

            public async Task<string> LogLaunch(string action, string details = "")
            {
                var data = await _form.LauncherApiAsync("/log", new JObject
                {
                    ["action"] = action,
                    ["details"] = details
                });
                return data.ToString();
            }

            public void SetBrand(string brand) => _form.SetBrand(brand);
            public string GetBrand() => _form.GetBrand();
            public string GetVersion() => _form._appVersion;

            // Native launch - implement actual game/client launch here
            public void LaunchClient()
            {
                // TODO: Replace with actual client executable launch
                // Example: Process.Start("SodaClient.exe", "--brand " + _form.GetBrand());
                MessageBox.Show($"Launching {_form.GetBrand()} client...\n(Implement actual launch logic here)", "Launch", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }

            public void OpenUrl(string url)
            {
                try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
            }

            public void MinimizeWindow() => _form.WindowState = FormWindowState.Minimized;
            public void CloseWindow() => _form.Close();
        }
    }
}