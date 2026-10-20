using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SodaLauncher
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherForm());
        }
    }

    public sealed class LauncherForm : Form
    {
        private readonly WebView2 webView = new WebView2();

        public LauncherForm()
        {
            Text = "SodaDlc Launcher";
            Width = 540;
            Height = 820;
            MinimumSize = new Size(460, 640);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(7, 9, 7);
            DoubleBuffered = true;

            string iconPath = Path.Combine(AppContext.BaseDirectory, "assets", "logo.ico");
            if (File.Exists(iconPath))
            {
                try { Icon = new Icon(iconPath); } catch { }
            }

            webView.Dock = DockStyle.Fill;
            webView.DefaultBackgroundColor = Color.FromArgb(7, 9, 7);
            Controls.Add(webView);

            Load += async (_, __) =>
            {
                try
                {
                    await InitWebViewAsync();
                }
                catch (Exception ex)
                {
                    MessageBox.Show(
                        "Не удалось запустить WebView2.\n\n" + ex.Message +
                        "\n\nУстановите Microsoft Edge WebView2 Runtime:\nhttps://go.microsoft.com/fwlink/p/?LinkId=2124703",
                        "SodaDlc Launcher",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    Close();
                }
            };
        }

        private async System.Threading.Tasks.Task InitWebViewAsync()
        {
            string dataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "SodaDlcLauncher",
                "WebView2"
            );
            Directory.CreateDirectory(dataDir);

            CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, dataDir);
            await webView.EnsureCoreWebView2Async(env);

            string assets = Path.Combine(AppContext.BaseDirectory, "assets");
            webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "sodalauncher.local",
                assets,
                CoreWebView2HostResourceAccessKind.Allow
            );

            CoreWebView2Settings settings = webView.CoreWebView2.Settings;
            settings.AreDefaultContextMenusEnabled = false;
            settings.AreDevToolsEnabled = false;
            settings.IsStatusBarEnabled = false;
            settings.IsZoomControlEnabled = false;
            settings.AreBrowserAcceleratorKeysEnabled = false;

            webView.CoreWebView2.Navigate("https://sodalauncher.local/launcher.html");
        }
    }
}
