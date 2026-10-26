// ayudante.exe: el ancla de Sloth en la barra de tareas en los Windows de antes de TaskbarManager (en los de ahora la pide
// Sloth.exe, electron/barra.ts), y quitarla al desinstalar (scripts/instalador.nsh). Lo compila scripts/compilar.mjs y
// viaja en resources. Cada orden hace una cosa y sale:
//   --anclar <exe>      la ancla; sale con 0 si quedó anclada y con 3 si Windows no dejó
//   --desanclar <exe>   la quita
// C# 5 para el csc de .NET Framework 4: sin $"" ni ?.
using System;

static class Ayudante
{
    [STAThread]
    static int Main(string[] args)
    {
        try
        {
            if (args.Length != 2) return 2;
            if (args[0] == "--anclar")
            {
                Accesos.Anclar();
                return Accesos.Anclado(args[1]) != null ? 0 : 3;
            }
            if (args[0] != "--desanclar") return 2;
            Accesos.Desanclar(args[1]);
            return 0;
        }
        catch (Exception)
        {
            return 3;
        }
    }
}
