# Aider adapter

```bash
../../install.sh aider
# then run aider as a two-tier router:
aider --architect \
      --model <your-frontier-model> \
      --editor-model <your-cheap-model> \
      --read CONVENTIONS.md
/read-only .tierdecay/
```
The natural fit: architect = T3/T2, editor = T1. As classes decay, more of
each task lands in the editor model's lap — watch the `executed` column drift.
