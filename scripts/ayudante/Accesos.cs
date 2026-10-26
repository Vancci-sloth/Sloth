// El ancla de Sloth en la barra de tareas (Ayudante.cs), por lo que usan Edge y Firefox en los Windows de antes de
// TaskbarManager (electron/barra.ts).
// C# 5 para el csc de .NET Framework 4: sin $"" ni ?.
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

static class Accesos
{
    /** El acceso del menú Inicio (`shortcutName` en scripts/compilar.mjs). */
    public static string Inicio { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Sloth.lnk"); } }

    /** Lo anclado a la barra de tareas es un acceso en esta carpeta (Windows la crea con el primero). */
    static string Anclados { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"); } }

    /** El acceso anclado a la barra de tareas que abre `exe`, o `null` si Sloth no está anclada. */
    public static string Anclado(string exe)
    {
        if (!Directory.Exists(Anclados)) return null;
        foreach (string lnk in Directory.GetFiles(Anclados, "*.lnk"))
        {
            try
            {
                IShellLinkW atajo = (IShellLinkW)new ShellLink();
                ((IPersistFile)atajo).Load(lnk, 0);
                StringBuilder destino = new StringBuilder(260);
                atajo.GetPath(destino, destino.Capacity, IntPtr.Zero, 0);
                if (string.Equals(destino.ToString(), exe, StringComparison.OrdinalIgnoreCase)) return lnk;
            }
            catch { /* Un acceso roto de otra app. */ }
        }
        return null;
    }

    /**
     * Ancla Sloth sin preguntar (lo pidió su botón), con IPinnedList3: sirve en Windows 10 y en 11 hasta 23H2. Después
     * Windows lo ignora sin decir nada: si quedó anclada se sabe con `Anclado`.
     */
    public static void Anclar()
    {
        Modificar(null, Inicio);
    }

    /** Quita a Sloth de la barra de tareas, si estaba: al desinstalar quedaría un ancla rota. */
    public static void Desanclar(string exe)
    {
        string anclado = Anclado(exe);
        if (anclado == null) return;
        try { Modificar(anclado, null); } catch { }
    }

    /** IPinnedList3::Modify de Windows, sin documentar. Hay que llamarla desde un hilo STA. */
    static void Modificar(string desanclar, string anclar)
    {
        IntPtr quitar = desanclar == null ? IntPtr.Zero : ILCreateFromPathW(desanclar);
        IntPtr poner = anclar == null ? IntPtr.Zero : ILCreateFromPathW(anclar);
        try
        {
            if (quitar != IntPtr.Zero || poner != IntPtr.Zero) ((IPinnedList3)new TaskbandPin()).Modify(quitar, poner, int.MaxValue);
        }
        finally
        {
            ILFree(quitar);
            ILFree(poner);
        }
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] static extern IntPtr ILCreateFromPathW(string ruta);
    [DllImport("shell32.dll")] static extern void ILFree(IntPtr pidl);

    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    class ShellLink { }

    [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder archivo, int largo, IntPtr datos, int banderas);
        void GetIDList(out IntPtr pidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder texto, int largo);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string texto);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder dir, int largo);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string dir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder args, int largo);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string args);
        void GetHotkey(out short tecla);
        void SetHotkey(short tecla);
        void GetShowCmd(out int modo);
        void SetShowCmd(int modo);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder ruta, int largo, out int indice);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string ruta, int indice);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string ruta, int reservado);
        void Resolve(IntPtr ventana, int banderas);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string archivo);
    }

    [ComImport, Guid("90AA3A4E-1CBA-4233-B8BB-535773D48449")]
    class TaskbandPin { }

    /** Solo se llama `Modify`; lo de antes ocupa su lugar en la tabla y no se usa. */
    [ComImport, Guid("0DD79AE2-D156-45D4-9EEB-3B549769E940"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPinnedList3
    {
        void EnumObjects();
        void GetPinnableInfo();
        void IsPinnable();
        void Resolve();
        void LegacyModify();
        void GetChangeCount();
        void IsPinned();
        void GetPinnedItem();
        void GetAppIDForPinnedItem();
        void ItemChangeNotify();
        void UpdateForRemovedItemsAsNecessary();
        void PinShellLink();
        void GetPinnedItemForAppID();
        void Modify(IntPtr desanclar, IntPtr anclar, int quien);
    }
}
