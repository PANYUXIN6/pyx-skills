import subprocess


def run_report(report_name: str) -> str:
    result = subprocess.run(
        f"printf 'report=%s' {report_name}",
        shell=True,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout
