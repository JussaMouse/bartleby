#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib
import subprocess
import sys
import time
import traceback
from typing import Any


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def load_json(path: str) -> dict[str, Any]:
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError('config must be a JSON object')
    return data


def count_jsonl_rows(path: str | None) -> int:
    if not path:
        return 0
    p = pathlib.Path(path)
    if not p.exists() or not p.is_file():
        return 0
    count = 0
    with p.open('r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                count += 1
    return count


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def run_cmd(cmd: list[str], cwd: pathlib.Path | None = None) -> None:
    emit({'type': 'log', 'level': 'info', 'message': f"running: {' '.join(cmd)}"})
    proc = subprocess.Popen(cmd, cwd=str(cwd) if cwd else None, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.rstrip('\n')
        if line:
            emit({'type': 'log', 'level': 'info', 'message': line})
    code = proc.wait()
    if code != 0:
        raise RuntimeError(f"command failed ({code}): {' '.join(cmd)}")


def write_json(path: pathlib.Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')


def run(config_path: str, run_dir: str) -> int:
    emit({'type': 'status', 'stage': 'preflight', 'message': 'loading run config'})
    config = load_json(config_path)
    run_id = str(config.get('runId') or 'unknown-run')

    train_rows = count_jsonl_rows(config.get('trainPath'))
    val_rows = count_jsonl_rows(config.get('valPath'))
    test_rows = count_jsonl_rows(config.get('testPath'))
    emit({'type': 'metrics', 'metrics': {'dataset': {'train': train_rows, 'val': val_rows, 'test': test_rows, 'total': train_rows + val_rows + test_rows}}})

    env_dir = pathlib.Path(str(config.get('routerTrainingEnvDir') or ''))
    if not env_dir.exists():
        raise RuntimeError(f'routerTrainingEnvDir does not exist: {env_dir}')

    base_path = pathlib.Path(str(config.get('basePath') or ''))
    artifact_dir = pathlib.Path(str(config.get('artifactDir') or pathlib.Path(run_dir) / 'artifacts'))
    artifact_dir.mkdir(parents=True, exist_ok=True)
    adapter_path = artifact_dir / f"{config.get('outputAdapterVersion', 'adapter')}.npz"
    manifest_path = artifact_dir / 'artifact-manifest.json'
    artifact_id = str(config.get('artifactId') or config.get('outputAdapterVersion') or run_id)

    data_dir = pathlib.Path(run_dir) / 'mlx-data'
    data_dir.mkdir(parents=True, exist_ok=True)
    for src_key, dest_name in [('mlxTrainPath', 'train.jsonl'), ('mlxValPath', 'valid.jsonl'), ('mlxTestPath', 'test.jsonl')]:
        src = pathlib.Path(str(config.get(src_key) or ''))
        if src.exists():
            (data_dir / dest_name).write_text(src.read_text(encoding='utf-8'), encoding='utf-8')

    emit({'type': 'status', 'stage': 'train', 'message': 'starting MLX-LM LoRA training'})
    args = config.get('mlxLmTrainArgs') or {}
    cmd = [
        'poetry', 'run', str(config.get('mlxLmCli') or 'mlx_lm.lora'),
        '--model', str(base_path),
        '--train',
        '--data', str(data_dir),
        '--adapter-path', str(adapter_path),
        '--batch-size', str(args.get('batchSize', 4)),
        '--iters', str(args.get('iters', 200)),
        '--learning-rate', str(args.get('learningRate', 1e-4)),
        '--steps-per-report', str(args.get('stepsPerReport', 10)),
        '--steps-per-eval', str(args.get('stepsPerEval', 25)),
        '--save-every', str(args.get('saveEvery', 50)),
        '--num-layers', str(args.get('numLayers', 8)),
    ]
    run_cmd(cmd, cwd=env_dir)

    metrics = {
        'run_id': run_id,
        'simulated': False,
        'dataset': {'train': train_rows, 'val': val_rows, 'test': test_rows, 'total': train_rows + val_rows + test_rows},
        'artifacts': {'adapter_path': str(adapter_path), 'manifest_path': str(manifest_path)},
    }
    quantization_recipe = {'method': 'lora-adapter', 'format': 'npz', 'note': 'serving remains adapter-backed until merged export is added'}
    manifest = {
        'artifact_id': artifact_id,
        'run_id': run_id,
        'base_id': config.get('baseId'),
        'base_model': config.get('baseModel'),
        'base_path': str(base_path),
        'dataset_version': config.get('datasetVersion'),
        'artifact_path': str(adapter_path),
        'artifact_format': 'npz',
        'artifact_precision': 'lora-adapter',
        'quantization_recipe': quantization_recipe,
        'sha256': sha256_file(adapter_path) if adapter_path.exists() else None,
        'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }
    write_json(manifest_path, manifest)

    emit({'type': 'result', 'adapter_path': str(adapter_path), 'artifact_path': str(adapter_path), 'manifest_path': str(manifest_path), 'artifact_id': artifact_id, 'format': 'npz', 'precision': 'lora-adapter', 'quantization_recipe': quantization_recipe, 'metrics': metrics})
    return 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Router training worker using MLX-LM')
    parser.add_argument('--config', required=True, help='Path to run-config.json')
    parser.add_argument('--run-dir', required=True, help='Output directory for logs/artifacts')
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        pathlib.Path(args.run_dir).mkdir(parents=True, exist_ok=True)
        return run(args.config, args.run_dir)
    except Exception as exc:
        emit({'type': 'error', 'message': str(exc)})
        print(traceback.format_exc(), file=sys.stderr, flush=True)
        return 1


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
