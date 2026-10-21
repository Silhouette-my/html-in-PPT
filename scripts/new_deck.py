#!/usr/bin/env python3
"""Copy the self-contained starter deck. Content authoring is a separate step."""
import argparse
import sys
from pathlib import Path

# Windows redirected consoles may default to cp1252, which cannot print Chinese.
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

parser = argparse.ArgumentParser(description="创建离线 HTML 幻灯片模板（随后替换示例内容）")
parser.add_argument("output", type=Path, help="输出 .html 文件")
args = parser.parse_args()
if args.output.suffix.lower() != ".html":
    parser.error("输出路径必须以 .html 结尾")
source = Path(__file__).resolve().parents[1] / "assets" / "deck-template.html"
args.output.parent.mkdir(parents=True, exist_ok=True)
try:
    with args.output.open("xb") as destination:
        destination.write(source.read_bytes())
except FileExistsError:
    parser.error(f"文件已存在，未覆盖：{args.output}")
print(f"已创建 {args.output}；请替换示例幻灯片、讲稿与标题。")
